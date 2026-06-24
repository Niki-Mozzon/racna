// Interactive rule builder. Turns an entry into an ignore/watch rule. For
// network entries it breaks the URL into clickable "chips" (one per path
// segment and query param) that the user toggles to `*` to build a glob
// pattern; for console entries it's a free-text pattern seeded with the
// message. The chip state lives in state.ruleEditorSegments; the UI is rendered
// by renderRuleEditor and committed by confirmRule.

import { state } from '../state.js';
import { setIgnoreRules, setWatchRules } from '../storage.js';
import { escHtml, ruleKindIcon, ruleKindLabel, statusClass, URL_BASE } from '../util.js';

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
    parsed = new URL(rawUrl, URL_BASE);
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
    parsed = new URL(rawUrl, URL_BASE);
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

  const nextIgnore = state.ignoreRules.filter((r) => ruleKey(r) !== key);
  const nextWatch = state.watchRules.filter((r) => ruleKey(r) !== key);
  const ignoreChanged = type === 'ignore' || nextIgnore.length !== state.ignoreRules.length;
  const watchChanged = type === 'watch' || nextWatch.length !== state.watchRules.length;
  if (type === 'ignore') nextIgnore.push(finalRule);
  else nextWatch.push(finalRule);

  state.ignoreRules = nextIgnore;
  state.watchRules = nextWatch;
  // Persist only the list(s) that actually changed (skip a redundant
  // chrome.storage.sync write to the untouched list on every save).
  if (ignoreChanged) setIgnoreRules(state.ignoreRules);
  if (watchChanged) setWatchRules(state.watchRules);
}

/** Shape a rule of the entry's own kind around the given base fields. Network
 *  rules carry the entry's status; the console family carries none. Shared by
 *  confirmRule and the editor's conflict probe so both compute the same ruleKey. */
function ruleForEntry(
  entry: Entry,
  base: { id: string; pattern: string; note: string; createdAt: number },
): Rule {
  return entry.kind === 'network'
    ? entry.status != null
      ? { ...base, kind: 'network', status: entry.status }
      : { ...base, kind: 'network' }
    : { ...base, kind: entry.kind };
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
  const rule = ruleForEntry(entry, {
    id: genRuleId(),
    pattern,
    note: note.trim(),
    createdAt: Date.now(),
  });

  upsertRule(type, rule);
}

/** Open the editor for an entry (entry mode). Seeds chips (network) or the
 *  pattern text (console). If a rule already matches this entry's seeded
 *  pattern, the toggle shows that rule's CURRENT type (not the clicked one) and
 *  blinks toward the other option, so moving a rule is always deliberate. */
export function showRuleEditor(type: 'ignore' | 'watch', entry: Entry): void {
  state.ruleEditorEntry = entry;
  state.ruleEditorRule = null;
  state.ruleEditorBlink = false;
  if (entry.kind === 'network') {
    state.ruleEditorSegments = parseEditorSegments(entry);
  } else {
    state.ruleEditorConsolePattern = entry.message;
  }

  const seeded =
    entry.kind === 'network'
      ? buildEditorPattern(entry, state.ruleEditorSegments)
      : entry.message.trim();
  const probe = ruleForEntry(entry, { id: '', pattern: seeded, note: '', createdAt: 0 });
  const key = ruleKey(probe);
  const existingIgnore = state.ignoreRules.find((r) => ruleKey(r) === key);
  const existingWatch = state.watchRules.find((r) => ruleKey(r) === key);
  const existing = existingIgnore ?? existingWatch;

  if (existing) {
    const existingType = existingIgnore ? 'ignore' : 'watch';
    state.ruleEditorType = existingType;
    state.ruleEditorRule = existing;
    // Only hint a move when the user clicked the OTHER type than the rule's
    // current one; clicking the same type just opens it for editing.
    state.ruleEditorBlink = type !== existingType;
  } else {
    state.ruleEditorType = type;
  }

  if (state.ruleEditorEl) {
    const noteTa = state.ruleEditorEl.querySelector<HTMLTextAreaElement>('#re-note-ta');
    if (noteTa) noteTa.value = existing?.note ?? '';
    renderRuleEditor();
    state.ruleEditorEl.style.display = '';
  }
}

/** Flip the ignore/watch choice and repaint; a deliberate choice clears blink. */
export function setRuleEditorType(type: RuleType): void {
  state.ruleEditorType = type;
  state.ruleEditorBlink = false;
  renderRuleEditor();
}

/** Open the editor on a stored rule (rule mode): settings "Edit rule", the toast
 * "Rule" button, or the orange bell. No source entry, so the pattern is read-only. */
export function showRuleEditorForRule(rule: Rule, type: RuleType): void {
  state.ruleEditorType = type;
  state.ruleEditorEntry = null;
  state.ruleEditorRule = rule;
  state.ruleEditorBlink = false;
  if (state.ruleEditorEl) {
    const noteTa = state.ruleEditorEl.querySelector<HTMLTextAreaElement>('#re-note-ta');
    if (noteTa) noteTa.value = rule.note ?? '';
    renderRuleEditor();
    state.ruleEditorEl.style.display = '';
  }
}

/** Delete the rule open in rule mode from whichever list holds it. */
export function deleteRuleFromEditor(): void {
  const rule = state.ruleEditorRule;
  if (!rule) return;
  state.ignoreRules = state.ignoreRules.filter((r) => r.id !== rule.id);
  state.watchRules = state.watchRules.filter((r) => r.id !== rule.id);
  setIgnoreRules(state.ignoreRules);
  setWatchRules(state.watchRules);
  hideRuleEditor();
}

/** Save whatever the editor holds, then close it. Entry mode builds a fresh rule
 *  from the chips/console pattern; rule mode re-saves the open rule with the
 *  current type + note. Both flow through upsertRule. Returns false when there's
 *  nothing valid to save (caller skips the refresh). */
export function confirmRuleEditor(): boolean {
  const el = state.ruleEditorEl;
  const type = state.ruleEditorType;
  if (!el || type === '') return false;
  const noteTa = el.querySelector<HTMLTextAreaElement>('#re-note-ta');
  const note = noteTa ? noteTa.value : '';

  const entry = state.ruleEditorEntry;
  if (entry) {
    const pattern =
      entry.kind === 'network'
        ? buildEditorPattern(entry, state.ruleEditorSegments)
        : (
            el.querySelector<HTMLTextAreaElement>('#re-console-ta')?.value ??
            state.ruleEditorConsolePattern
          ).trim();
    if (!pattern) return false;
    confirmRule(type, entry, pattern, note);
  } else if (state.ruleEditorRule) {
    upsertRule(type, { ...state.ruleEditorRule, note: note.trim() });
  } else {
    return false;
  }
  hideRuleEditor();
  return true;
}

export function hideRuleEditor(): void {
  if (state.ruleEditorEl) state.ruleEditorEl.style.display = 'none';
  state.ruleEditorType = '';
  state.ruleEditorEntry = null;
  state.ruleEditorSegments = [];
  state.ruleEditorConsolePattern = '';
  state.ruleEditorRule = null;
  state.ruleEditorBlink = false;
}

/** Paint the editor from current state: the network branch renders path/query
 *  chips and a live pattern preview; the console branch shows the editable
 *  pattern textarea. Method and status are fixed (shown but not editable) for
 *  network rules. */
export function renderRuleEditor(): void {
  const el = state.ruleEditorEl;
  if (!el) return;
  const e = state.ruleEditorEntry;
  const ruleMode = !e;

  const titleEl = el.querySelector('.re-title');
  const kindBadge = el.querySelector('#re-kind-badge');
  const netSection = el.querySelector<HTMLElement>('.re-net-section');
  const conSection = el.querySelector<HTMLElement>('.re-con-section');
  const previewEl = el.querySelector('#re-preview');
  const conflictEl = el.querySelector<HTMLElement>('#re-conflict');
  const deleteBtn = el.querySelector<HTMLElement>('#re-delete-btn');
  const confirmBtn = el.querySelector<HTMLButtonElement>('[data-action="confirm-rule"]');
  if (!titleEl || !netSection || !conSection || !previewEl || !confirmBtn) return;

  const kind = e ? e.kind : (state.ruleEditorRule?.kind ?? 'console');
  if (kindBadge) {
    kindBadge.innerHTML = ruleKindIcon(kind) + '<span>' + ruleKindLabel(kind) + '</span>';
  }

  titleEl.textContent = ruleMode ? 'Edit Rule' : 'New Rule';
  confirmBtn.textContent = ruleMode ? 'Save Rule' : 'Create Rule';
  confirmBtn.className =
    'pbtn ' + (state.ruleEditorType === 'ignore' ? 're-btn-ignore' : 're-btn-watch');

  el.querySelectorAll<HTMLElement>('.re-type-opt').forEach((opt) => {
    const t = opt.getAttribute('data-rule-type');
    opt.classList.toggle('active', t === state.ruleEditorType);
    opt.classList.toggle('blink', state.ruleEditorBlink && t !== state.ruleEditorType);
  });

  if (conflictEl) {
    if (!ruleMode && state.ruleEditorRule) {
      if (state.ruleEditorBlink) {
        const other = state.ruleEditorType === 'ignore' ? 'Watch' : 'Ignore';
        conflictEl.textContent =
          'Already a ' + state.ruleEditorType + ' rule. Tap ' + other + ' to move it.';
      } else {
        conflictEl.textContent = 'Already a ' + state.ruleEditorType + ' rule; editing it.';
      }
      conflictEl.style.display = '';
    } else {
      conflictEl.style.display = 'none';
    }
  }

  if (deleteBtn) deleteBtn.style.display = ruleMode ? '' : 'none';

  if (!e) {
    netSection.style.display = 'none';
    conSection.style.display = 'none';
    previewEl.textContent = state.ruleEditorRule?.pattern ?? '(empty)';
    return;
  }

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
