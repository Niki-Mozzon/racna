import { findWatchRule } from '../rules/matching.js';
import { state } from '../state.js';
import { entryClass, entryIcon, escHtml, linkifyHtml, truncate, urlPath } from '../util.js';

// The watch-rule toast: a transient notification shown when an entry matches a
// watch rule (see fireWatchToast in entries.ts). Only one toast exists at a
// time; showing a new one dismisses the previous.

import type { Entry } from '../../shared/types.js';

type ActionHandler = (btn: HTMLElement) => void;

// Indirection to break a would-be import cycle (toast → actions → toast).
// actions.ts injects the real handler via setToastActionHandler at load time;
// until then clicks are no-ops.
let toastActionHandler: ActionHandler = () => {
  /* set by actions.ts at init */
};

export function setToastActionHandler(fn: ActionHandler): void {
  toastActionHandler = fn;
}

/** Remove the current toast (if any) from the DOM and clear its state. */
export function dismissToast(): void {
  if (state.toastEl?.parentNode) state.toastEl.parentNode.removeChild(state.toastEl);
  state.toastEl = null;
  state.toastEntry = null;
}

/** Show a toast for a watch-matched entry. Includes the matching rule's note
 *  (if any) as a reminder of why it's being watched. Wires its own click
 *  delegation back through the injected action handler. */
export function showToast(e: Entry): void {
  dismissToast(); // single-toast invariant: replace any existing one
  if (!state.shadow) return;
  state.toastEntry = e;
  const cls = entryClass(e);
  const iconHtml = '<span class="toast-icon">' + entryIcon(e) + '</span>';
  const msgText =
    e.kind === 'network'
      ? (e.method ?? 'REQ') + ' ' + truncate(urlPath(e.url ?? ''), 48)
      : truncate(e.message, 60);
  const rule = findWatchRule(e);
  const note = rule?.note ?? '';
  const noteHtml = note ? '<div class="toast-note">' + linkifyHtml(note) + '</div>' : '';
  const toastEl = document.createElement('div');
  toastEl.className = 'racna-toast ' + cls;
  toastEl.innerHTML =
    '<div class="toast-body">' +
    iconHtml +
    '<div class="toast-text">' +
    '<span class="toast-msg">' +
    escHtml(msgText) +
    '</span>' +
    noteHtml +
    '</div>' +
    '<div class="toast-actions">' +
    '<button class="pbtn" data-action="view-toast">View</button>' +
    '<button class="pbtn pbtn-close" data-action="dismiss-toast">×</button>' +
    '</div>' +
    '</div>';
  toastEl.addEventListener('click', (ev) => {
    const target = ev.target instanceof Element ? ev.target : null;
    const btn = target?.closest<HTMLElement>('[data-action]');
    if (btn) toastActionHandler(btn);
  });
  state.shadow.appendChild(toastEl);
  state.toastEl = toastEl;
}
