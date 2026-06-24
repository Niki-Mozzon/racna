import { REPLAY_TYPE } from '../shared/protocol.js';

import { resumeCapture } from './rendering/flood-banner.js';
import {
  hideModal,
  showModal,
  buildModalText,
  refreshModalWatchButton,
} from './rendering/modal-detail.js';
import {
  hideSettingsModal,
  renderSettingsModal,
  showSettingsModal,
} from './rendering/modal-settings.js';
import { renderBadge, renderList } from './rendering/panel.js';
import { dismissToast, setToastActionHandler } from './rendering/toast.js';
import {
  confirmRuleEditor,
  deleteRuleFromEditor,
  hideRuleEditor,
  setRuleEditorType,
  showRuleEditor,
  showRuleEditorForRule,
} from './rules/editor.js';
import { findWatchRule } from './rules/matching.js';
import { state } from './state.js';
import { setIgnoreRules, setWatchRules, setEnabledSites } from './storage.js';
import { feedback } from './util.js';

import type { Entry } from '../shared/types.js';

/** Open the watch editor for an entry: rule mode on the existing rule if it is
 *  already watched (orange bell, modal, or toast), else entry mode to create one. */
function openWatchEditor(e: Entry | null): void {
  if (!e) return;
  const watched = findWatchRule(e);
  if (watched) showRuleEditorForRule(watched, 'watch');
  else showRuleEditor('watch', e);
}

/**
 * Central command dispatcher. The whole UI uses event delegation: clickable
 * elements carry a `data-action` attribute (plus `data-*` payload like
 * `data-id` / `data-rule-id`), a single delegated listener in index.ts finds
 * the nearest `[data-action]` ancestor and calls this. That keeps us from
 * attaching/detaching listeners every time the list re-renders as HTML strings.
 */
export function handleAction(btn: HTMLElement): void {
  const action = btn.getAttribute('data-action');
  if (!action) return;

  switch (action) {
    case 'replay': {
      // Cross back into the MAIN world: ask the interceptor to re-print the
      // original (live, expandable) args it stashed under this storeId. We only
      // hold a serialized copy here, so the real object can only be logged from
      // the world that captured it. See messaging.ts setupReplayListener.
      const storeIdAttr = btn.getAttribute('data-store-id');
      const storeId = storeIdAttr ? parseInt(storeIdAttr, 10) : NaN;
      if (!isNaN(storeId)) {
        window.postMessage({ type: REPLAY_TYPE, storeId }, '*');
        feedback(btn as HTMLButtonElement, '✓ Logged');
      }
      return;
    }
    case 'copy-modal': {
      if (!state.currentModalEntry) return;
      const text = buildModalText(state.currentModalEntry);
      try {
        navigator.clipboard.writeText(text).then(
          () => {
            feedback(btn as HTMLButtonElement, '✓ Copied');
          },
          () => {
            feedback(btn as HTMLButtonElement, '✗ Error');
          },
        );
      } catch {
        feedback(btn as HTMLButtonElement, '✗ Error');
      }
      return;
    }
    case 'close-modal':
      hideModal();
      return;
    case 'ignore': {
      const idAttr = btn.getAttribute('data-id');
      const id = idAttr ? parseInt(idAttr, 10) : NaN;
      const e = state.entries.find((x) => x.id === id);
      if (e) showRuleEditor('ignore', e);
      return;
    }
    case 'ignore-modal':
      if (state.currentModalEntry) showRuleEditor('ignore', state.currentModalEntry);
      return;
    case 'watch': {
      const idAttr = btn.getAttribute('data-id');
      const id = idAttr ? parseInt(idAttr, 10) : NaN;
      openWatchEditor(state.entries.find((x) => x.id === id) ?? null);
      return;
    }
    case 'watch-modal':
      openWatchEditor(state.currentModalEntry);
      return;
    case 'view-toast': {
      if (state.toastEntry) {
        const e = state.toastEntry;
        dismissToast();
        showModal(e);
      }
      return;
    }
    case 'dismiss-toast':
      dismissToast();
      return;
    case 'resume-flood':
      resumeCapture();
      return;
    case 'open-settings':
      showSettingsModal();
      return;
    case 'close-settings':
      hideSettingsModal();
      return;
    case 'del-ignore-rule': {
      const ruleId = btn.getAttribute('data-rule-id');
      state.ignoreRules = state.ignoreRules.filter((r) => r.id !== ruleId);
      setIgnoreRules(state.ignoreRules);
      renderList();
      renderBadge();
      renderSettingsModal();
      return;
    }
    case 'del-watch-rule': {
      const ruleId = btn.getAttribute('data-watch-rule-id');
      state.watchRules = state.watchRules.filter((r) => r.id !== ruleId);
      setWatchRules(state.watchRules);
      renderList();
      renderSettingsModal();
      refreshModalWatchButton();
      return;
    }
    case 'del-site': {
      const hostname = btn.getAttribute('data-hostname');
      state.enabledSites = state.enabledSites.filter((h) => h !== hostname);
      setEnabledSites(state.enabledSites);
      renderBadge();
      renderSettingsModal();
      return;
    }
    case 'close-rule-editor':
      hideRuleEditor();
      return;
    case 'confirm-rule': {
      if (confirmRuleEditor()) {
        renderList();
        renderBadge();
        renderSettingsModal();
        refreshModalWatchButton();
      }
      return;
    }
    case 'set-rule-editor-type': {
      const t = btn.getAttribute('data-rule-type');
      if (t === 'ignore' || t === 'watch') setRuleEditorType(t);
      return;
    }
    case 'edit-rule': {
      const ruleId = btn.getAttribute('data-rule-id');
      const listType = btn.getAttribute('data-rule-list');
      if (listType !== 'ignore' && listType !== 'watch') return;
      const list = listType === 'ignore' ? state.ignoreRules : state.watchRules;
      const rule = list.find((r) => r.id === ruleId);
      if (rule) showRuleEditorForRule(rule, listType);
      return;
    }
    case 'delete-rule': {
      deleteRuleFromEditor();
      renderList();
      renderBadge();
      renderSettingsModal();
      refreshModalWatchButton();
      return;
    }
    case 'edit-rule-from-toast':
      openWatchEditor(state.toastEntry);
      dismissToast();
      return;
    default:
      return;
  }
}

// The toast module can't import handleAction directly (it would create an
// actions ↔ toast import cycle), so we inject it here after both modules have
// loaded. See setToastActionHandler in rendering/toast.ts.
setToastActionHandler(handleAction);
