// The intake pipeline: turns an interceptor payload into an Entry in `state`,
// applying every gate along the way. This is where capture filters, ignore
// rules, deduplication, and watch notifications all converge; the order of
// those checks is deliberate and documented in addEntry below.

import { DEDUP_LOOKBACK, DEDUP_MS } from './constants.js';
import { enterFlood, registerRate, scheduleDropCountUpdate } from './rendering/flood-banner.js';
import { scheduleCountUpdate, scheduleRender } from './rendering/panel.js';
import { showToast } from './rendering/toast.js';
import { findWatchRule, matchesIgnoreRule, withinCooldown } from './rules/matching.js';
import { atEntryCap, currentSite, state } from './state.js';
import { dedupKey } from './util.js';

import type { Entry, InterceptorPayload } from '../shared/types.js';

type CapturableMessage = InterceptorPayload & {
  level?: string;
  status?: number;
};

/** Should this event be captured at all? Checks the master switch, the
 *  per-site enable list, then the per-kind/per-level display toggles. Network
 *  events are additionally gated by the minimum-status setting (status 0,
 *  outright failures, always passes). */
export function shouldCapture(ev: CapturableMessage): boolean {
  if (!state.settings.enabled) return false;
  if (!state.enabledSites.includes(currentSite())) return false;
  if (ev.kind === 'console' || ev.kind === 'uncaught' || ev.kind === 'rejection') {
    return ev.level === 'warn' ? state.settings.showConsoleWarns : state.settings.showConsoleErrors;
  }
  // Narrowed: ev.kind === 'network'
  if (!state.settings.showNetwork) return false;
  const min = state.settings.networkMinStatus || 0;
  const status = ev.status;
  if (min === 500 && status < 500 && status !== 0) return false;
  if (min === 400 && status < 400 && status !== 0) return false;
  return true;
}

/** Show a watch toast for an entry that re-fired (the dedup path), respecting
 *  the per-rule cooldown. Records the fire time so the cooldown can advance. */
export function fireWatchToast(e: Entry): void {
  const rule = findWatchRule(e);
  if (!rule || withinCooldown(rule)) return;
  state.watchToastTimes[rule.id] = Date.now();
  showToast(e);
}

/** Normalise a wire payload into the flat Entry shape, filling the fields that
 *  don't apply to this kind with null. The two branches mirror the network vs
 *  console/uncaught/rejection split in the message union. */
function payloadToEntry(ev: InterceptorPayload): Entry {
  const ts = ev.timestamp;
  if (ev.kind === 'network') {
    return {
      id: state.nextId++,
      kind: 'network',
      level: 'error',
      message: '',
      url: ev.url,
      method: ev.method,
      status: ev.status,
      statusText: ev.statusText,
      filename: null,
      lineno: null,
      stack: ev.stack,
      storeId: null,
      reqHeaders: ev.reqHeaders,
      reqBody: ev.reqBody,
      resHeaders: ev.resHeaders,
      resBody: ev.resBody,
      duration: ev.duration,
      pageUrl: ev.pageUrl,
      breadcrumbs: ev.breadcrumbs,
      firstSeen: ts,
      timestamp: ts,
      count: 1,
    };
  }
  // Console / uncaught / rejection
  return {
    id: state.nextId++,
    kind: ev.kind,
    level: ev.level,
    message: ev.message,
    url: null,
    method: null,
    status: null,
    statusText: null,
    filename: ev.kind === 'uncaught' ? ev.filename : null,
    lineno: ev.kind === 'uncaught' ? ev.lineno : null,
    stack: ev.stack,
    storeId: ev.storeId,
    reqHeaders: null,
    reqBody: null,
    resHeaders: null,
    resBody: null,
    duration: undefined,
    pageUrl: ev.pageUrl,
    breadcrumbs: ev.breadcrumbs,
    firstSeen: ts,
    timestamp: ts,
    count: 1,
  };
}

/**
 * The single entry point for an incoming event. Gate order matters:
 *   1. shouldCapture: display filters / per-site enable.
 *   2. watch rules take precedence over ignore rules: if an event matches a
 *      watch rule we never ignore it (a watch is an explicit "tell me about
 *      this"). Within cooldown, we drop it entirely to avoid toast spam.
 *   3. ignore rules, only consulted when no watch rule matched.
 *   4. flood guard: pause capture if events are arriving faster than the rate
 *      limit, freezing the snapshot until the user resumes.
 *   5. dedup: collapse a repeat of any of the last few entries.
 *   6. append + cap + notify.
 */
export function addEntry(ev: InterceptorPayload): void {
  if (!shouldCapture(ev)) return;
  const watchRule = findWatchRule(ev);
  const willWatch = watchRule !== null;

  if (willWatch && withinCooldown(watchRule)) return;
  if (!willWatch && matchesIgnoreRule(ev)) return;

  // Flood guard, after the capture/watch/ignore gates so only events that would
  // actually be shown count toward the rate. While paused we drop silently:
  // the already-captured snapshot stays fully inspectable; the user resumes from
  // the in-panel notice. See flood-banner.ts.
  if (state.floodPaused) {
    state.floodDropped++;
    scheduleDropCountUpdate();
    return;
  }
  if (registerRate(ev.timestamp)) {
    enterFlood();
    state.floodDropped++;
    scheduleDropCountUpdate();
    return;
  }

  // Dedup: collapse a repeat of any of the last DEDUP_LOOKBACK entries (within
  // DEDUP_MS) into that row, bumping it in place (no reordering) so the list
  // stays stable. Scanning a small window (not just the previous entry)
  // catches interleaved loops (A,B,A,B…). dedupKey keys network rows on
  // method+status+path, not their (empty) message, so distinct failing routes
  // stay separate. See util.ts.
  const key = dedupKey(ev);
  const lookback = Math.min(state.entries.length, DEDUP_LOOKBACK);
  for (let i = state.entries.length - 1; i >= state.entries.length - lookback; i--) {
    const e = state.entries[i];
    if (!e || ev.timestamp - e.timestamp >= DEDUP_MS) continue; // outside the merge window
    if (dedupKey(e) === key) {
      e.count++;
      e.timestamp = ev.timestamp; // slide the window so a steady stream keeps merging
      // Patch this row's count cell in place rather than rebuilding the whole
      // list: a dedup bump changes no structure, and a full rebuild every frame
      // during an error storm destroys the row the user is mid-click on. See
      // scheduleCountUpdate in panel.ts.
      if (state.domReady) scheduleCountUpdate(e.id);
      if (willWatch) fireWatchToast(e);
      return;
    }
  }

  // Capture cap: once the buffer is full, stop storing new entries rather than
  // evicting older ones. At this volume it's almost always a dedup-collapsed
  // cycle (repeats merge above, so they never reach here) or a burst the user
  // triages from the first few and then reloads. We keep the earliest N; the
  // panel shows a notice and the badge pulses (renderBadge / renderList). Clear
  // or a reload resumes capture. Repeats still merge into existing rows above.
  if (atEntryCap()) {
    state.capDropped++;
    scheduleDropCountUpdate();
    return;
  }

  state.entries.push(payloadToEntry(ev));
  if (!state.isExpanded) state.hasUnseen = true; // light up the badge while collapsed
  if (state.domReady) scheduleRender(true);
  if (willWatch) {
    state.watchToastTimes[watchRule.id] = Date.now();
    const last = state.entries.at(-1);
    if (last) showToast(last);
  }
}
