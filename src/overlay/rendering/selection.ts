import { matchesIgnoreRule } from '../rules/matching.js';
import { state } from '../state.js';

import { renderList } from './panel.js';

// Multi-select mode: lets the user tick a subset of entries and bulk-export
// them. Swaps the normal header for a selection bar while active. Selection is
// transient (not persisted) and keyed by entry id.

import type { Entry } from '../../shared/types.js';

/** The currently-visible entries (newest-first, ignored excluded): the set
 *  selection and "select all" operate over. Mirrors renderList's filter. */
export function visibleEntries(): Entry[] {
  return state.entries
    .slice()
    .reverse()
    .filter((e) => !matchesIgnoreRule(e));
}

/** Enter multi-select: swap header → selection bar and repaint rows with
 *  checkboxes. No-op if already selecting or the panel isn't built yet. */
export function enterSelectionMode(): void {
  if (state.selectionMode || !state.panelEl) return;
  state.selectionMode = true;
  state.selectedIds = new Set();
  state.panelEl.classList.add('selecting');
  if (state.headerEl) state.headerEl.style.display = 'none';
  if (state.selectionBarEl) state.selectionBarEl.style.display = '';
  renderSelectionBar();
  renderList();
}

/** Leave multi-select, clearing the selection and restoring the header. */
export function exitSelectionMode(): void {
  if (!state.selectionMode) return;
  state.selectionMode = false;
  state.selectedIds = new Set();
  if (state.panelEl) state.panelEl.classList.remove('selecting');
  if (state.headerEl) state.headerEl.style.display = '';
  if (state.selectionBarEl) state.selectionBarEl.style.display = 'none';
  renderList();
}

export function toggleEntrySelection(id: number): void {
  if (state.selectedIds.has(id)) state.selectedIds.delete(id);
  else state.selectedIds.add(id);
  renderList();
  renderSelectionBar();
}

/** Update the selection bar's count, the select-all/deselect-all toggle label,
 *  and the export button's enabled state. */
export function renderSelectionBar(): void {
  if (!state.selectionBarEl) return;
  const visible = visibleEntries();
  const total = visible.length;
  const count = state.selectedIds.size;
  const allSelected = total > 0 && count === total;
  const countEl = state.selectionBarEl.querySelector('.psel-count');
  if (countEl) countEl.textContent = String(count) + ' selected';
  const selectAllBtn = state.selectionBarEl.querySelector('#en-select-all');
  if (selectAllBtn) selectAllBtn.textContent = allSelected ? 'Deselect all' : 'Select all';
  const exportBtn = state.selectionBarEl.querySelector<HTMLButtonElement>('#en-export-selected');
  if (exportBtn) exportBtn.disabled = count === 0;
}
