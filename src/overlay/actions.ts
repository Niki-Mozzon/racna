import { REPLAY_TYPE } from '../shared/protocol.js';

import {
  applyCopyTemplate,
  handleSaveCopyTemplate,
  handleUpdateActiveTemplate,
  setActiveCopyTemplateId,
} from './copy-templates.js';
import { resumeCapture } from './rendering/flood-banner.js';
import {
  hideModal,
  showModal,
  buildModalText,
  renderCopyTemplatePicker,
} from './rendering/modal-detail.js';
import {
  hideSettingsModal,
  renderSettingsModal,
  showSettingsModal,
} from './rendering/modal-settings.js';
import { renderBadge, renderList } from './rendering/panel.js';
import { dismissToast, setToastActionHandler } from './rendering/toast.js';
import { buildEditorPattern, confirmRule, hideRuleEditor, showRuleEditor } from './rules/editor.js';
import { state } from './state.js';
import { setIgnoreRules, setWatchRules, setEnabledSites, setCopyTemplates } from './storage.js';
import { feedback } from './util.js';

/**
 * Central command dispatcher. The whole UI uses event delegation: clickable
 * elements carry a `data-action` attribute (plus `data-*` payload like
 * `data-id` / `data-rule-id`), a single delegated listener in index.ts finds
 * the nearest `[data-action]` ancestor and calls this. That keeps us from
 * attaching/detaching listeners every time the list re-renders as HTML strings.
 *
 * The `default` branch is load-bearing: any unrecognised action is treated as
 * a copy-template id (the template picker emits the template's id as its
 * action), so adding a template needs no new case here.
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
    case 'delete-template': {
      const activeId = state.activeCopyTemplateId;
      if (!activeId || activeId.startsWith('builtin:')) return;
      const customs = state.settings.copyTemplates.filter((t) => t.id !== activeId);
      state.settings.copyTemplates = customs;
      setCopyTemplates(customs);
      setActiveCopyTemplateId(null);
      renderCopyTemplatePicker();
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
      const e = state.entries.find((x) => x.id === id);
      if (e) showRuleEditor('watch', e);
      return;
    }
    case 'watch-modal':
      if (state.currentModalEntry) showRuleEditor('watch', state.currentModalEntry);
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
      return;
    }
    case 'edit-rule-note': {
      state.editingRuleId = btn.getAttribute('data-rule-id');
      renderSettingsModal();
      if (state.settingsModalEl && state.editingRuleId) {
        const ta = state.settingsModalEl.querySelector<HTMLTextAreaElement>(
          'textarea[data-rule-note-ta="' + state.editingRuleId + '"]',
        );
        if (ta) {
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }
      }
      return;
    }
    case 'cancel-rule-note':
      state.editingRuleId = null;
      renderSettingsModal();
      return;
    case 'save-rule-note': {
      const ruleId = btn.getAttribute('data-rule-id');
      const listType = btn.getAttribute('data-rule-list');
      const ta = state.settingsModalEl?.querySelector<HTMLTextAreaElement>(
        'textarea[data-rule-note-ta="' + (ruleId ?? '') + '"]',
      );
      const newNote = ta ? ta.value.trim() : '';
      if (listType === 'ignore') {
        state.ignoreRules = state.ignoreRules.map((r) =>
          r.id === ruleId ? { ...r, note: newNote } : r,
        );
        setIgnoreRules(state.ignoreRules);
      } else {
        state.watchRules = state.watchRules.map((r) =>
          r.id === ruleId ? { ...r, note: newNote } : r,
        );
        setWatchRules(state.watchRules);
      }
      state.editingRuleId = null;
      renderSettingsModal();
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
      if (!state.ruleEditorEntry || !state.ruleEditorEl) return;
      let pattern: string;
      if (state.ruleEditorEntry.kind === 'network') {
        pattern = buildEditorPattern(state.ruleEditorEntry, state.ruleEditorSegments);
      } else {
        const ta = state.ruleEditorEl.querySelector<HTMLTextAreaElement>('#re-console-ta');
        pattern = (ta ? ta.value : state.ruleEditorConsolePattern).trim();
      }
      if (!pattern) return;
      const noteTa = state.ruleEditorEl.querySelector<HTMLTextAreaElement>('#re-note-ta');
      const note = noteTa ? noteTa.value : '';
      const rType = state.ruleEditorType;
      const rEntry = state.ruleEditorEntry;
      if (rType === '') return;
      hideRuleEditor();
      confirmRule(rType, rEntry, pattern, note);
      renderList();
      renderBadge();
      return;
    }
    case 'save-copy-template':
      handleSaveCopyTemplate();
      return;
    case 'update-active-template':
      handleUpdateActiveTemplate();
      return;
    default: {
      if (action.length > 0) {
        // Unknown action; try treating it as a copy template id
        applyCopyTemplate(action);
      }
      return;
    }
  }
}

// The toast module can't import handleAction directly (it would create an
// actions ↔ toast import cycle), so we inject it here after both modules have
// loaded. See setToastActionHandler in rendering/toast.ts.
setToastActionHandler(handleAction);
