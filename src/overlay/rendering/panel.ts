import { BELL, EYE_SLASH, GLOBE, getIconImg } from '../constants.js';
import { matchesIgnoreRule, matchesWatchRule } from '../rules/matching.js';
import { atEntryCap, currentSite, state } from '../state.js';
import {
  entryClass,
  entryIcon,
  entryTooltip,
  escHtml,
  formatTime,
  hasExpandableDetail,
  statusClass,
  truncate,
  urlPath,
} from '../util.js';

// Renders the two collapsed/expanded faces of the overlay: the floating badge
// (a count chip when collapsed) and the entry list (when expanded).
//
// Rendering strategy: build an HTML string and assign innerHTML; no virtual
// DOM, no per-row listeners. Each render replaces the whole list; clicks are
// caught by the delegated listener in index.ts via data-action. This is simple
// and fast enough for a capped list, but it means EVERY page-derived value
// interpolated below MUST go through escHtml (the XSS guard: captured content
// is attacker-controlled). Don't add a raw interpolation here.

import type { Entry } from '../../shared/types.js';

/** Repaint whatever is currently showing: always the badge, plus the list if
 *  the panel is expanded. */
export function render(): void {
  renderBadge();
  if (state.isExpanded) renderList();
}

// ── Throttled rendering ─────────────────────────────────────────────────────
// Intake (addEntry) can fire dozens of times per second. Painting synchronously
// on every event rebuilds the whole list each time and lags the UI. Instead the
// hot path calls scheduleRender(), which coalesces every request between two
// animation frames into a single repaint, so paint cost is capped at the frame
// rate no matter how fast events arrive. User-driven renders stay synchronous.
let rafId = 0;
let pendingFull = false; // a full render (badge + list) was requested this frame
let pendingList = false; // a full list rebuild (no badge) was requested this frame
const dirtyCounts = new Set<number>(); // ids whose repeat-count cell needs an in-place patch

// jsdom/unit tests may lack requestAnimationFrame, so fall back to a macrotask.
function nextFrame(cb: FrameRequestCallback): number {
  return typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(cb)
    : (setTimeout(() => {
        cb(0);
      }, 0) as unknown as number);
}

/** Schedule the single coalescing frame if one isn't already pending. Inside it
 *  we apply the strongest request made this frame, in precedence order: a full
 *  render (badge + list) subsumes a list rebuild, which subsumes in-place count
 *  patches. */
function ensureFrame(): void {
  if (rafId) return;
  rafId = nextFrame(() => {
    rafId = 0;
    const doFull = pendingFull;
    const doList = pendingList;
    const counts = doFull || doList ? [] : [...dirtyCounts];
    pendingFull = false;
    pendingList = false;
    dirtyCounts.clear();
    if (doFull) render();
    else if (doList) renderList();
    else patchCounts(counts);
  });
}

/** Queue a repaint for the next animation frame, collapsing repeated calls into
 *  one. `full` repaints the badge too (the entry count changed); otherwise only
 *  the list is rebuilt. Once a full render is requested it sticks for the frame. */
export function scheduleRender(full: boolean): void {
  if (full) pendingFull = true;
  else pendingList = true;
  ensureFrame();
}

/** Queue an in-place patch of a single entry's repeat-count (and timestamp)
 *  cells, coalesced into the same frame. A dedup bump only mutates an existing
 *  row's count (no rows added, removed, or reordered), so a full list rebuild
 *  would needlessly replace DOM the user may be mid-click on. During a post-cap
 *  error storm every render is a count bump, so this is what keeps the list
 *  clickable. A full render / list rebuild pending this frame subsumes it. */
export function scheduleCountUpdate(id: number): void {
  dirtyCounts.add(id);
  ensureFrame();
}

/** Patch just the count/time cells of the given rows, leaving the rest of the
 *  list DOM (and the user's pointer target) untouched. No-op for rows not
 *  currently mounted: ignored entries, or a collapsed panel. The count span is
 *  always present (see renderEntry), so a 1→2 transition needs no node insert. */
function patchCounts(ids: number[]): void {
  if (!state.listEl) return;
  for (const id of ids) {
    const e = state.entries.find((x) => x.id === id);
    if (!e) continue;
    const row = state.listEl.querySelector('.entry[data-id="' + String(id) + '"]');
    if (!row) continue;
    const countEl = row.querySelector('.count');
    if (countEl) countEl.textContent = e.count > 1 ? '×' + String(e.count) : '';
    const timeEl = row.querySelector('.etime');
    if (timeEl) timeEl.textContent = formatTime(e.timestamp);
  }
}

/** Draw the collapsed badge: a logo + count of currently-visible entries.
 *  Hidden entirely while expanded, while disabled, off-site, or at zero count.
 *  Ignored entries are excluded from the count so the badge matches the list. */
export function renderBadge(): void {
  if (!state.badgeEl) return;
  if (state.isExpanded) {
    state.badgeEl.style.display = 'none';
    return;
  }
  let errors = 0;
  let warns = 0;
  let network = 0;
  for (const e of state.entries) {
    if (matchesIgnoreRule(e)) continue;
    if (e.kind === 'network') network++;
    else if (e.level === 'warn') warns++;
    else errors++;
  }
  const visible = errors + warns + network;
  if (!state.settings.enabled || !state.enabledSites.includes(currentSite()) || visible === 0) {
    state.badgeEl.style.display = 'none';
    return;
  }
  state.badgeEl.style.display = '';
  state.badgeEl.classList.toggle('unseen', state.hasUnseen);
  // Blink whenever capture is paused (flood or cap) so the user notices and
  // opens the panel (where the notice explains it). Persists regardless of
  // seen-state.
  state.badgeEl.classList.toggle('alarm', state.floodPaused || atEntryCap());
  // At the cap, show "{limit-1}+" (e.g. 49+ for a 50 limit, 99+ for 100) to
  // signal the ceiling rather than a precise-looking number; otherwise the exact
  // count. The count never exceeds the limit (capture pauses there).
  const cap = state.settings.maxEntries || 100;
  const shown = atEntryCap() ? String(cap - 1) + '+' : String(visible);
  state.badgeEl.innerHTML = getIconImg() + '<span class="bcount">' + shown + '</span>';
}

/** Rebuild the entry list. Shows newest-first, hides ignored entries, and
 *  toggles the export/select buttons by whether anything is visible. */
export function renderList(): void {
  if (!state.listEl) return;
  // .slice() so we don't mutate state.entries; .reverse() for newest-first.
  const visible = state.entries
    .slice()
    .reverse()
    .filter((e) => !matchesIgnoreRule(e));
  if (state.headerEl) {
    const exportBtn = state.headerEl.querySelector<HTMLButtonElement>('#en-export');
    const selectBtn = state.headerEl.querySelector<HTMLButtonElement>('#en-select');
    if (exportBtn) exportBtn.disabled = visible.length === 0;
    if (selectBtn) selectBtn.disabled = visible.length === 0;
  }
  // A sticky notice explains why capture has paused, shown where the user
  // looks for errors, not in a global banner. Flood (rate) takes precedence over
  // the cap (count); flood carries a live dropped-count and its own Resume,
  // since clearing the list wouldn't lift a rate pause.
  let notice = '';
  if (state.floodPaused) {
    notice =
      '<div class="pcap">Errors arriving too fast. Capture paused (over ' +
      String(state.settings.floodRate) +
      '/sec). <span class="drop-count">' +
      String(state.floodDropped) +
      '</span> dropped.' +
      '<button class="pcap-btn" data-action="resume-flood">Resume</button></div>';
  } else if (atEntryCap()) {
    notice =
      '<div class="pcap">Limit reached - capture paused. <span class="drop-count">' +
      String(state.capDropped) +
      '</span> dropped. Clear to capture more.</div>';
  }
  // Fade the radar sweep while paused (see .panel.paused::after) so it reads as
  // "not scanning". Toggled here so it tracks the notice's presence.
  state.panelEl?.classList.toggle('paused', state.floodPaused || atEntryCap());
  if (visible.length === 0 && notice === '') {
    state.listEl.innerHTML = '<div class="empty">No errors captured yet</div>';
    return;
  }
  state.listEl.innerHTML = notice + visible.map(renderEntry).join('');
}

/** Build the HTML for one entry row: type icon, the body (network shows
 *  method/status/path; others show the message), repeat count, watch/ignore
 *  buttons, and timestamp. Returns a string to be joined into the list. */
export function renderEntry(e: Entry): string {
  const cls = entryClass(e);
  const hasDetail = hasExpandableDetail(e);
  const chevron = hasDetail ? '<span class="chevron">▸</span>' : '';
  // Always emit the count span (empty/hidden at count 1 via .count:empty) so a
  // later in-place dedup patch can update it without inserting a node; see
  // patchCounts / scheduleCountUpdate.
  const countHtml = '<span class="count">' + (e.count > 1 ? '×' + String(e.count) : '') + '</span>';
  const time = formatTime(e.timestamp);

  let bodyHtml: string;
  if (e.kind === 'network') {
    const status = e.status === 0 ? 'ERR' : String(e.status);
    const path = escHtml(truncate(urlPath(e.url ?? ''), 80));
    bodyHtml =
      '<span class="eicon" title="Failed network request">' +
      GLOBE +
      '</span>' +
      '<span class="emethod">' +
      escHtml(e.method ?? 'REQ') +
      '</span>' +
      '<span class="estatus ' +
      statusClass(e.status) +
      '">' +
      status +
      '</span>' +
      '<span class="epath">' +
      path +
      '</span>';
  } else {
    bodyHtml =
      '<span class="eicon" title="' +
      entryTooltip(e) +
      '">' +
      entryIcon(e) +
      '</span>' +
      '<span class="emsg">' +
      escHtml(truncate(e.message, 90)) +
      '</span>';
  }

  const ignoreBtn =
    '<button class="pbtn entry-btn ignore-btn" data-action="ignore" data-id="' +
    String(e.id) +
    '" title="Ignore this error">' +
    EYE_SLASH +
    '</button>';
  const isWatched = matchesWatchRule(e);
  const watchBtn =
    '<button class="pbtn entry-btn watch-btn' +
    (isWatched ? ' watching' : '') +
    '" data-action="watch" data-id="' +
    String(e.id) +
    '" title="' +
    (isWatched ? 'Edit watch rule' : 'Watch this error') +
    '">' +
    BELL +
    '</button>';
  const selectedCls = state.selectionMode && state.selectedIds.has(e.id) ? ' selected' : '';
  return (
    '<div class="entry ' +
    cls +
    (hasDetail ? ' expandable' : '') +
    selectedCls +
    '" data-id="' +
    String(e.id) +
    '">' +
    '<div class="emain">' +
    chevron +
    bodyHtml +
    countHtml +
    watchBtn +
    ignoreBtn +
    '<span class="etime">' +
    time +
    '</span></div>' +
    '</div>'
  );
}
