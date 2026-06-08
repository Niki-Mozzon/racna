// The flood circuit breaker. When errors arrive faster than the overlay can
// usefully show them (more than settings.floodRate within FLOOD_WINDOW_MS), capture
// pauses, freezing the current snapshot so it stays fully clickable and
// exportable. The pause surfaces as a sticky notice inside the panel (see
// renderList in panel.ts) with a live dropped-count and a Resume button, and
// the badge blinks. This mirrors the entry-cap notice rather than a separate
// top-of-screen banner.
//
// This module owns the sliding-window rate meter (registerRate) and the
// pause/resume control; panel.ts renders the notice. We call panel's render()
// to surface/hide it and update the badge; panel doesn't import us, so there's
// no cycle. entries.ts calls in here; nothing here imports entries.ts.

import { FLOOD_WINDOW_MS } from '../constants.js';
import { state } from '../state.js';

import { render } from './panel.js';

// Timestamps of recently-captured events, trimmed to the trailing window. Kept
// module-local (not on `state`) because it is pure bookkeeping the UI never reads.
let recentTimes: number[] = [];

/** Record a captured event at time `ts` and report whether the rate now exceeds
 *  the flood threshold. Drops timestamps outside the trailing window first so
 *  the array stays bounded by the rate, not by total event count. */
export function registerRate(ts: number): boolean {
  recentTimes.push(ts);
  const cutoff = ts - FLOOD_WINDOW_MS;
  // Events arrive roughly in order, so the stale ones are at the front.
  while (recentTimes.length > 0) {
    const first = recentTimes[0];
    if (first === undefined || first >= cutoff) break;
    recentTimes.shift();
  }
  return recentTimes.length > state.settings.floodRate;
}

/** Begin a pause: freeze the snapshot. The re-render surfaces the in-panel
 *  notice and blinks the badge; the rate window is cleared so the meter starts
 *  fresh after a later resume. */
export function enterFlood(): void {
  state.floodPaused = true;
  recentTimes = [];
  if (state.domReady) render();
}

/** Resume capture. No grace period: if the flood is still going, the meter
 *  trips again and re-pauses. Triggered by the notice's Resume button. */
export function resumeCapture(): void {
  state.floodPaused = false;
  state.floodDropped = 0;
  recentTimes = [];
  if (state.domReady) render();
}

/** Test/teardown helper: clear all flood state without touching the DOM. */
export function resetFloodState(): void {
  state.floodPaused = false;
  state.floodDropped = 0;
  recentTimes = [];
}

// The dropped count can climb thousands of times per second; throttle the
// textContent write to one per frame so updating the notice can't itself lag.
let countRafId = 0;

/** Refresh the in-panel dropped-count, coalesced to one update per animation
 *  frame. Shared by the flood and cap notices, as they're mutually exclusive
 *  (flood trips well before the buffer fills), so we write whichever is active.
 *  No-op when the notice isn't mounted (panel collapsed, or not paused):
 *  querySelector simply finds nothing. */
export function scheduleDropCountUpdate(): void {
  if (countRafId) return;
  const raf =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: FrameRequestCallback): number =>
          setTimeout(() => {
            cb(0);
          }, 0) as unknown as number;
  countRafId = raf(() => {
    countRafId = 0;
    const countEl = state.listEl?.querySelector('.drop-count');
    if (countEl)
      countEl.textContent = String(state.floodPaused ? state.floodDropped : state.capDropped);
  });
}
