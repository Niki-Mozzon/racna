// Interactive rule builder. Turns an entry into an ignore/watch rule. For
// network entries it breaks the URL into clickable "chips" (one per path
// segment and query param) that the user toggles to `*` to build a glob
// pattern; for console entries it's a free-text pattern seeded with the
// message. The chip state lives in state.ruleEditorSegments; the UI is rendered
// by renderRuleEditor and committed by confirmRule.

import { state } from '../state.js';
import { setIgnoreRules, setWatchRules } from '../storage.js';
import { escHtml, statusClass } from '../util.js';

import { ruleKey } from './matching.js';

import type { Entry, Rule, RuleType } from '../../shared/types.js';
import type { EditorSegment } from '../state.js';

/** Cheap unique id for a new rule (timestamp + random suffix). */
export function genRuleId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Split a network entry's URL into editable chips: one per non-empty path
 *  segment, one per query param, plus a synthetic "★ All" chip that wildcards
 *  the entire query string at once. */
export function parseEditorSegments(entry: Entry): EditorSegment[] {
  const segments: EditorSegment[] = [];
  const rawUrl = entry.url ?? '';
  let parsed: URL | null = null;
  try {
    parsed = new URL(rawUrl);
  } catch {
    /* ignore parse failure */
  }

  const pathname = parsed ? parsed.pathname : rawUrl;
  const parts = pathname.replace(/^\//, '').split('/');
  for (const p of parts) {
    if (p !== '') segments.push({ value: p, wildcard: false, kind: 'path' });
  }

  if (parsed?.search) {
    parsed.searchParams.forEach((val, key) => {
      segments.push({
        value: key + '=' + val,
        wildcard: false,
        kind: 'query-val',
        key,
        val,
      });
    });
    segments.push({ value: '★ All', wildcard: false, kind: 'query-all' });
  }

  return segments;
}

/** Reassemble the chips back into a glob pattern string (path + query).
 *  Wildcarded chips become `*`; the "★ All" chip, when wildcarded, collapses
 *  the whole query to `?*`. Preserves a trailing slash if the original had one.
 *  This is the live preview and the value stored on the rule. */
export function buildEditorPattern(entry: Entry | null, segments: EditorSegment[]): string {
  const rawUrl = entry?.url ?? '';
  let parsed: URL | null = null;
  try {
    parsed = new URL(rawUrl);
  } catch {
    /* ignore parse failure */
  }

  const pathSegs = segments.filter((s) => s.kind === 'path');
  const querySegs = segments.filter((s) => s.kind === 'query-val');
  const allChip = segments.find((s) => s.kind === 'query-all');

  let pathStr = '/' + pathSegs.map((s) => (s.wildcard ? '*' : s.value)).join('/');
  if (parsed?.pathname.endsWith('/') && pathStr !== '/') pathStr += '/';

  let queryStr = '';
  if (querySegs.length > 0) {
    if (allChip?.wildcard) {
      queryStr = '?*';
    } else {
      const paramParts = querySegs.map(
        (s) => (s.key ?? '') + '=' + (s.wildcard ? '*' : (s.val ?? '')),
      );
      queryStr = '?' + paramParts.join('&');
    }
  }

  return pathStr + queryStr;
}

/**
 * Insert or replace a rule by its canonical key. Any rule matching the same
 * thing is first removed from BOTH lists (so a pattern can never be duplicated
 * or live in both lists), then `rule` is added to the chosen list. If a rule
 * with this key already existed, its `id` and `createdAt` are reused, so a flip
 * or edit keeps the watch cooldown (keyed on id) intact.
 */
export function upsertRule(type: RuleType, rule: Rule): void {
  const key = ruleKey(rule);
  const existing =
    state.ignoreRules.find((r) => ruleKey(r) === key) ??
    state.watchRules.find((r) => ruleKey(r) === key);
  const finalRule: Rule = existing
    ? { ...rule, id: existing.id, createdAt: existing.createdAt }
    : rule;

  state.ignoreRules = state.ignoreRules.filter((r) => ruleKey(r) !== key);
  state.watchRules = state.watchRules.filter((r) => ruleKey(r) !== key);
  if (type === 'ignore') state.ignoreRules = [...state.ignoreRules, finalRule];
  else state.watchRules = [...state.watchRules, finalRule];

  setIgnoreRules(state.ignoreRules);
  setWatchRules(state.watchRules);
}

/**
 * Commit a built rule into state + storage. The kind comes from the entry
 * (network rules carry the status); dedup and ignore/watch moves are handled
 * by upsertRule.
 */
export function confirmRule(
  type: 'ignore' | 'watch',
  entry: Entry,
  pattern: string,
  note: string,
): void {
  const baseRule = {
    id: genRuleId(),
    pattern,
    note: note.trim(),
    createdAt: Date.now(),
  };
  const rule: Rule =
    entry.kind === 'network'
      ? entry.status != null
        ? { ...baseRule, kind: 'network', status: entry.status }
        : { ...baseRule, kind: 'network' }
      : { ...baseRule, kind: entry.kind };

  upsertRule(type, rule);
}

/** Open the editor for a given entry, seeding chips (network) or the pattern
 *  text (console) and clearing the note field. */
export function showRuleEditor(type: 'ignore' | 'watch', entry: Entry): void {
  state.ruleEditorType = type;
  state.ruleEditorEntry = entry;
  if (entry.kind === 'network') {
    state.ruleEditorSegments = parseEditorSegments(entry);
  } else {
    state.ruleEditorConsolePattern = entry.message;
  }
  if (state.ruleEditorEl) {
    const noteTa = state.ruleEditorEl.querySelector<HTMLTextAreaElement>('#re-note-ta');
    if (noteTa) noteTa.value = '';
    renderRuleEditor();
    state.ruleEditorEl.style.display = '';
  }
}

export function hideRuleEditor(): void {
  if (state.ruleEditorEl) state.ruleEditorEl.style.display = 'none';
  state.ruleEditorType = '';
  state.ruleEditorEntry = null;
  state.ruleEditorSegments = [];
  state.ruleEditorConsolePattern = '';
}

/** Paint the editor from current state: the network branch renders path/query
 *  chips and a live pattern preview; the console branch shows the editable
 *  pattern textarea. Method and status are fixed (shown but not editable) for
 *  network rules. */
export function renderRuleEditor(): void {
  const e = state.ruleEditorEntry;
  const el = state.ruleEditorEl;
  if (!e || !el) return;

  const titleEl = el.querySelector('.re-title');
  const netSection = el.querySelector<HTMLElement>('.re-net-section');
  const conSection = el.querySelector<HTMLElement>('.re-con-section');
  const previewEl = el.querySelector('#re-preview');
  const confirmBtn = el.querySelector<HTMLButtonElement>('[data-action="confirm-rule"]');

  if (!titleEl || !netSection || !conSection || !previewEl || !confirmBtn) return;

  titleEl.textContent = state.ruleEditorType === 'ignore' ? 'Ignore Rule' : 'Watch Rule';
  confirmBtn.className =
    'pbtn ' + (state.ruleEditorType === 'ignore' ? 're-btn-ignore' : 're-btn-watch');

  if (e.kind === 'network') {
    netSection.style.display = '';
    conSection.style.display = 'none';

    const metaRow = netSection.querySelector('.re-meta-row');
    if (metaRow) {
      metaRow.innerHTML =
        '<span class="re-meta-method">' +
        escHtml(e.method ?? 'REQ') +
        '</span>' +
        '<span class="re-meta-status ' +
        statusClass(e.status) +
        '">' +
        (e.status === 0 ? 'ERR' : String(e.status)) +
        '</span>' +
        '<span class="re-meta-hint">(method &amp; status are fixed)</span>';
    }

    const pathChipsEl = el.querySelector('#re-path-chips');
    const queryLabel = el.querySelector<HTMLElement>('#re-query-label');
    const queryChipsEl = el.querySelector('#re-query-chips');
    if (!pathChipsEl || !queryLabel || !queryChipsEl) return;

    const pathSegs = state.ruleEditorSegments.filter((s) => s.kind === 'path');
    const querySegs = state.ruleEditorSegments.filter((s) => s.kind === 'query-val');
    const allChip = state.ruleEditorSegments.find((s) => s.kind === 'query-all');

    if (pathSegs.length === 0) {
      pathChipsEl.innerHTML = '<span class="re-chip-hint">/ (root)</span>';
    } else {
      let pathHtml = '';
      for (const seg of pathSegs) {
        const idx = state.ruleEditorSegments.indexOf(seg);
        const chipCls = 're-chip' + (seg.wildcard ? ' re-chip-wild' : '');
        pathHtml +=
          '<span class="re-sep">/</span>' +
          '<span class="' +
          chipCls +
          '" data-chip-idx="' +
          String(idx) +
          '">' +
          escHtml(seg.wildcard ? '*' : seg.value) +
          '</span>';
      }
      pathChipsEl.innerHTML = pathHtml;
    }

    if (querySegs.length === 0) {
      queryLabel.style.display = 'none';
      queryChipsEl.innerHTML = '';
    } else {
      queryLabel.style.display = '';
      let queryHtml = '';
      for (const seg of querySegs) {
        const idx = state.ruleEditorSegments.indexOf(seg);
        const chipCls = 're-chip' + (seg.wildcard ? ' re-chip-wild' : '');
        queryHtml +=
          '<span class="' +
          chipCls +
          '" data-chip-idx="' +
          String(idx) +
          '">' +
          escHtml(seg.wildcard ? (seg.key ?? '') + '=*' : (seg.key ?? '') + '=' + (seg.val ?? '')) +
          '</span>';
      }
      if (allChip) {
        const allIdx = state.ruleEditorSegments.indexOf(allChip);
        const allCls = 're-chip re-chip-all' + (allChip.wildcard ? ' re-chip-wild' : '');
        queryHtml +=
          '<span class="' + allCls + '" data-chip-idx="' + String(allIdx) + '">★ All</span>';
      }
      queryChipsEl.innerHTML = queryHtml;
    }

    previewEl.textContent = buildEditorPattern(e, state.ruleEditorSegments);
  } else {
    netSection.style.display = 'none';
    conSection.style.display = '';
    const ta = el.querySelector<HTMLTextAreaElement>('#re-console-ta');
    // Don't overwrite the textarea while the user is typing in it. Only seed
    // its value when it isn't the focused element.
    if (ta && document.activeElement !== ta) ta.value = state.ruleEditorConsolePattern;
    previewEl.textContent = state.ruleEditorConsolePattern || '(empty)';
  }
}
