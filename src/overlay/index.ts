// Entry point for the ISOLATED-world content script: the overlay UI. Builds
// the whole interface inside a closed-off shadow DOM, wires every event
// listener, and connects the three inbound channels:
//   1. window 'message'      ← interceptor events (MAIN world)  → addEntry()
//   2. chrome.storage changes ← other tabs/devices              → re-render
//   3. chrome.runtime message ← the popup ("open settings")     → modal
//
// All UI is built imperatively as elements + HTML strings and mounted in a
// shadow root so the host page's CSS can never touch it, and ours never leaks
// out. Rendering/state/actions live in sibling modules; this file is the
// assembly + wiring layer.

import { MSG_TYPE, NAV_TYPE, OPEN_SETTINGS_TYPE, STATUS_TYPE } from '../shared/protocol.js';

import { handleAction } from './actions.js';
import { BELL, CONSOLE_ICON, COPY_ICON, EYE_SLASH, GEAR, getIconImg } from './constants.js';
import { addEntry } from './entries.js';
import { exportEntries } from './export.js';
import { hideModal, showModal, toggleFieldCollapsed } from './rendering/modal-detail.js';
import {
  hideSettingsModal,
  renderSettingsModal,
  showSettingsModal,
} from './rendering/modal-settings.js';
import { render, renderBadge, renderList } from './rendering/panel.js';
import {
  enterSelectionMode,
  exitSelectionMode,
  renderSelectionBar,
  visibleEntries,
} from './rendering/selection.js';
import { hideRuleEditor, renderRuleEditor } from './rules/editor.js';
import { currentSite, DEFAULTS, state } from './state.js';
import { loadBootstrap, setCopyFields, setEnabledSites, setSetting } from './storage.js';
import { CSS } from './styles.js';
import { hasExpandableDetail } from './util.js';

import type {
  CopyFieldKey,
  InterceptorPayload,
  Settings,
  StatusResponse,
} from '../shared/types.js';

/**
 * Construct the entire UI tree (badge, panel, three modals, toast host) and
 * attach all event listeners, then mount it into the shadow root. Runs once at
 * init. Clicks mostly funnel through the delegated handlers below into
 * handleAction (actions.ts) via data-action attributes; a few direct listeners
 * handle things that don't fit that model (resize drag, tab switching).
 */
function buildUI(): void {
  if (!state.shadow) return;

  const styleEl = document.createElement('style');
  styleEl.textContent = CSS;

  const root = document.createElement('div');
  root.className = 'root';

  // ── Badge ────────────────────────────────────────────────────────────────
  const badgeEl = document.createElement('div');
  badgeEl.className = 'badge';
  badgeEl.title = 'Racna: click to expand';
  badgeEl.style.display = 'none';
  badgeEl.addEventListener('click', () => {
    state.isExpanded = true;
    state.hasUnseen = false;
    if (state.panelEl) state.panelEl.style.display = '';
    badgeEl.style.display = 'none';
    renderList();
  });
  state.badgeEl = badgeEl;

  // ── Panel ────────────────────────────────────────────────────────────────
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';
  panelEl.style.display = 'none';
  state.panelEl = panelEl;

  const headerEl = document.createElement('div');
  headerEl.className = 'pheader';
  headerEl.innerHTML =
    getIconImg() +
    '<span class="ptitle">Racna</span>' +
    '<button class="pbtn" id="en-export" title="Export all visible errors to a Markdown file">Export</button>' +
    '<button class="pbtn" id="en-select" title="Pick specific errors to export">Select</button>' +
    '<button class="pbtn pbtn-icon" id="en-settings" title="Settings">' +
    GEAR +
    '</button>' +
    '<button class="pbtn" id="en-clear">Clear</button>' +
    '<button class="pbtn pbtn-close" id="en-close">×</button>';
  state.headerEl = headerEl;

  const selectionBarEl = document.createElement('div');
  selectionBarEl.className = 'pheader pheader-selection';
  selectionBarEl.style.display = 'none';
  selectionBarEl.innerHTML =
    '<span class="psel-count">0 selected</span>' +
    '<button class="pbtn" id="en-select-all">Select all</button>' +
    '<button class="pbtn" id="en-export-selected" disabled>Export</button>' +
    '<button class="pbtn" id="en-cancel-select">Cancel</button>';
  state.selectionBarEl = selectionBarEl;

  const listEl = document.createElement('div');
  listEl.className = 'plist';
  state.listEl = listEl;

  // Baseline tooltips before storage hydrates; bootstrapState() re-syncs them.
  updateExportTooltips();

  headerEl.querySelector('#en-export')?.addEventListener('click', () => {
    exportEntries(visibleEntries());
  });
  headerEl.querySelector('#en-select')?.addEventListener('click', () => {
    if (visibleEntries().length === 0) return;
    enterSelectionMode();
  });
  const settingsBtn = headerEl.querySelector<HTMLElement>('#en-settings');
  if (settingsBtn) {
    settingsBtn.setAttribute('data-action', 'open-settings');
    settingsBtn.addEventListener('click', () => {
      handleAction(settingsBtn);
    });
  }
  headerEl.querySelector('#en-clear')?.addEventListener('click', () => {
    state.entries = [];
    state.capDropped = 0; // clearing drops below the cap, so reset the dropped count
    if (state.selectionMode) exitSelectionMode();
    renderList();
    renderBadge();
  });
  headerEl.querySelector('#en-close')?.addEventListener('click', () => {
    if (state.selectionMode) exitSelectionMode();
    state.isExpanded = false;
    if (state.panelEl) state.panelEl.style.display = 'none';
    renderBadge();
  });

  selectionBarEl.querySelector('#en-select-all')?.addEventListener('click', () => {
    const visible = visibleEntries();
    const allSelected = visible.length > 0 && state.selectedIds.size === visible.length;
    if (allSelected) {
      state.selectedIds = new Set();
    } else {
      state.selectedIds = new Set();
      for (const e of visible) state.selectedIds.add(e.id);
    }
    renderList();
    renderSelectionBar();
  });
  selectionBarEl.querySelector('#en-export-selected')?.addEventListener('click', () => {
    if (state.selectedIds.size === 0) return;
    const picked = state.entries.filter((e) => state.selectedIds.has(e.id));
    exportEntries(picked);
    exitSelectionMode();
  });
  selectionBarEl.querySelector('#en-cancel-select')?.addEventListener('click', () => {
    exitSelectionMode();
  });

  // ── Resize handle ────────────────────────────────────────────────────────
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';
  panelEl.appendChild(resizeHandle);

  let resizing = false;
  let resizeStartX = 0;
  let resizeStartW = 0;
  resizeHandle.addEventListener('mousedown', (e) => {
    resizing = true;
    resizeStartX = e.clientX;
    resizeStartW = panelEl.offsetWidth;
    resizeHandle.classList.add('dragging');
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    // The handle sits on the panel's inner edge: the left edge when anchored
    // right (drag left = widen) and the right edge when anchored left (drag
    // right = widen). Flip the delta sign accordingly. Clamp to [300px, vw-32px].
    const anchoredLeft = state.settings.position.endsWith('-left');
    const delta = anchoredLeft ? e.clientX - resizeStartX : resizeStartX - e.clientX;
    const w = Math.min(Math.max(resizeStartW + delta, 300), window.innerWidth - 32);
    panelEl.style.width = String(w) + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!resizing) return;
    resizing = false;
    resizeHandle.classList.remove('dragging');
  });

  // Delegated click handling for the list. Three outcomes, in priority order:
  // in selection mode a row toggles its checkbox; otherwise a data-action
  // button runs its command; otherwise clicking the row body opens the detail
  // modal (unless another modal is already open).
  listEl.addEventListener('click', (event) => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    const entryEl = t.closest<HTMLElement>('.entry[data-id]');
    if (state.selectionMode) {
      if (entryEl) {
        const idAttr = entryEl.getAttribute('data-id');
        const id = idAttr ? parseInt(idAttr, 10) : NaN;
        if (!isNaN(id)) {
          // Toggle handled via selection module - inline to avoid circular dep
          if (state.selectedIds.has(id)) state.selectedIds.delete(id);
          else state.selectedIds.add(id);
          renderList();
          renderSelectionBar();
        }
      }
      return;
    }
    const btn = t.closest<HTMLElement>('[data-action]');
    if (btn) {
      handleAction(btn);
      return;
    }
    if (entryEl) {
      // Don't open the detail modal if a settings/rule-editor modal is up;
      // the click that's reaching the list is likely a dismiss, not a drill-in.
      if (
        state.settingsModalEl?.style.display !== 'none' ||
        state.ruleEditorEl?.style.display !== 'none'
      ) {
        return;
      }
      const idAttr = entryEl.getAttribute('data-id');
      const id = idAttr ? parseInt(idAttr, 10) : NaN;
      const e = state.entries.find((x) => x.id === id);
      if (e && hasExpandableDetail(e)) showModal(e);
    }
  });

  panelEl.appendChild(headerEl);
  panelEl.appendChild(selectionBarEl);
  panelEl.appendChild(listEl);
  root.appendChild(badgeEl);
  root.appendChild(panelEl);

  // ── Detail modal ─────────────────────────────────────────────────────────
  const modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.style.display = 'none';
  modalEl.innerHTML =
    '<div class="modal">' +
    '<div class="modal-header">' +
    '<span class="modal-title"></span>' +
    '<button class="pbtn pbtn-icon" data-action="replay" title="Log to console" style="display:none">' +
    CONSOLE_ICON +
    '</button>' +
    '<button class="pbtn pbtn-icon" data-action="watch-modal" title="Watch">' +
    BELL +
    '</button>' +
    '<button class="pbtn pbtn-icon" data-action="ignore-modal" title="Ignore">' +
    EYE_SLASH +
    '</button>' +
    '<button class="pbtn pbtn-icon" data-action="copy-modal" title="Copy all">' +
    COPY_ICON +
    '</button>' +
    '<label class="ai-flag" title="Format Copy / Export for AI debugging tools: error first, fenced sections, breadcrumb timeline, truncation notes">' +
    '<span class="ai-flag-text">AI</span>' +
    '<span class="sswitch sswitch-sm">' +
    '<input type="checkbox" id="ai-format">' +
    '<span class="sslider"></span>' +
    '</span>' +
    '</label>' +
    '<button class="pbtn pbtn-close" data-action="close-modal">×</button>' +
    '</div>' +
    '<div class="modal-body"></div>' +
    '</div>';
  state.modalEl = modalEl;
  state.modalBodyEl = modalEl.querySelector('.modal-body');

  modalEl.addEventListener('click', (event) => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    // The copy-field toggles are <label>/<input> switches; let their native
    // click+change behaviour run and don't bubble it into section-collapse.
    if (t.closest('.sswitch')) {
      event.stopPropagation();
      return;
    }
    const btn = t.closest<HTMLElement>('[data-action]');
    if (btn) {
      event.stopPropagation();
      handleAction(btn);
      return;
    }
    const titleEl = t.closest('.msec-title');
    if (titleEl) {
      const sec = titleEl.parentElement;
      if (sec?.classList.contains('msec') && !sec.classList.contains('msec-empty')) {
        const key = sec.getAttribute('data-field-key');
        if (key) toggleFieldCollapsed(key as CopyFieldKey);
      }
      event.stopPropagation();
      return;
    }
    if (event.target === modalEl) hideModal();
  });
  modalEl.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const ai = target.closest<HTMLInputElement>('#ai-format');
    if (ai) {
      state.settings.aiFormat = ai.checked;
      setSetting('aiFormat', ai.checked);
      updateExportTooltips();
      return;
    }
    const input = target.closest<HTMLInputElement>('input[data-copy-field]');
    if (!input) return;
    const key = input.getAttribute('data-copy-field') as CopyFieldKey | null;
    if (!key) return;
    state.settings.copyFields = { ...state.settings.copyFields, [key]: input.checked };
    setCopyFields(state.settings.copyFields);
  });

  // Escape closes one layer at a time, innermost first: the rule editor sits
  // on top of the settings modal, which sits on top of the detail modal. Each
  // branch returns so a single press never collapses two layers at once.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (state.ruleEditorEl && state.ruleEditorEl.style.display !== 'none') {
      hideRuleEditor();
      return;
    }
    if (state.settingsModalEl && state.settingsModalEl.style.display !== 'none') {
      hideSettingsModal();
      return;
    }
    if (state.modalEl && state.modalEl.style.display !== 'none') hideModal();
  });

  // ── Settings modal ───────────────────────────────────────────────────────
  const settingsModalEl = document.createElement('div');
  settingsModalEl.className = 'modal-overlay';
  settingsModalEl.style.display = 'none';
  // Version for the About row; guarded since getManifest can be absent in some
  // contexts. Falls back to no version label rather than a stray "v".
  let versionLabel = '';
  try {
    const v = chrome.runtime.getManifest().version;
    if (v) versionLabel = ' <em>v' + v + '</em>';
  } catch {
    /* no manifest available */
  }
  settingsModalEl.innerHTML =
    '<div class="modal smodal">' +
    '<div class="modal-header">' +
    '<span class="modal-title">' +
    getIconImg() +
    'Racna</span>' +
    '<button class="pbtn pbtn-close" data-action="close-settings">×</button>' +
    '</div>' +
    '<div class="stabs">' +
    '<button class="stab active" data-tab="settings">Settings</button>' +
    '<button class="stab" data-tab="rules">Rules</button>' +
    '<button class="stab" data-tab="sites">Sites</button>' +
    '</div>' +
    '<div id="stab-settings" class="stab-panel modal-body smodal-body">' +
    '<div class="ssec">' +
    '<div class="ssec-title">Appearance</div>' +
    '<div class="srow" title="Switch between the dark and light colour themes"><span>Theme</span>' +
    '<select class="sselect" data-setting="theme">' +
    '<option value="dark">Dark</option>' +
    '<option value="light">Light</option>' +
    '</select></div>' +
    '<div class="srow" title="Which corner the badge, panel, and toast anchor to. Move it if it covers something on the page"><span>Position</span>' +
    '<select class="sselect" data-setting="position">' +
    '<option value="bottom-right">Bottom right</option>' +
    '<option value="bottom-left">Bottom left</option>' +
    '<option value="top-right">Top right</option>' +
    '<option value="top-left">Top left</option>' +
    '</select></div>' +
    '</div>' +
    '<div class="ssec">' +
    '<div class="ssec-title">Console</div>' +
    '<div class="srow" title="Captures console.error(), uncaught exceptions, and unhandled promise rejections"><span>Errors <em>console.error, uncaught, rejections</em></span>' +
    '<label class="sswitch"><input type="checkbox" data-setting="showConsoleErrors"><span class="sslider"></span></label></div>' +
    '<div class="srow" title="Captures console.warn() calls"><span>Warnings <em>console.warn</em></span>' +
    '<label class="sswitch"><input type="checkbox" data-setting="showConsoleWarns"><span class="sslider"></span></label></div>' +
    '</div>' +
    '<div class="ssec">' +
    '<div class="ssec-title">Network</div>' +
    '<div class="srow" title="Captures fetch and XHR requests that fail or return an error status code"><span>Show failed requests</span>' +
    '<label class="sswitch"><input type="checkbox" data-setting="showNetwork"><span class="sslider"></span></label></div>' +
    '<div class="srow" data-depends="showNetwork" title="Only capture HTTP responses at or above this status code"><span>Minimum status</span>' +
    '<select class="sselect" data-setting="networkMinStatus">' +
    '<option value="400">All HTTP errors (4xx + 5xx)</option>' +
    '<option value="500">Server errors only (5xx)</option>' +
    '</select></div>' +
    '<div class="srow" data-depends="showNetwork" title="Capture requests that never got a response: offline, DNS failure, CORS block, or cancelled"><span>Network failures</span>' +
    '<label class="sswitch"><input type="checkbox" data-setting="showNetworkFailures"><span class="sslider"></span></label></div>' +
    '</div>' +
    '<div class="ssec">' +
    '<div class="ssec-title">Behaviour</div>' +
    '<div class="srow" title="Automatically clears the error list when the page URL changes (useful on single-page apps)"><span>Clear on navigation</span>' +
    '<label class="sswitch"><input type="checkbox" data-setting="clearOnNav"><span class="sslider"></span></label></div>' +
    '<div class="srow" title="Masks credential headers (Authorization, Cookie, Set-Cookie, X-Api-Key) in Copy and Export output. Bodies can still contain secrets, so give what you share a quick look."><span>Hide sensitive headers <em>in copy / export, headers only</em></span>' +
    '<label class="sswitch"><input type="checkbox" data-setting="redactSensitive"><span class="sslider"></span></label></div>' +
    '</div>' +
    '<div class="ssec">' +
    '<div class="ssec-title">Limits</div>' +
    '<div class="srow" title="Stop storing new errors once this many are captured (the earliest are kept; Clear to capture more)"><span>Error limit <em>pause capture at N entries</em></span>' +
    '<select class="sselect" data-setting="maxEntries">' +
    '<option value="50">50</option>' +
    '<option value="100">100</option>' +
    '<option value="250">250</option>' +
    '<option value="500">500</option>' +
    '</select></div>' +
    '<div class="srow" title="Pause capture when more than this many errors arrive in one second. Guards against runaway loops"><span>Flood threshold <em>pause above N/sec</em></span>' +
    '<select class="sselect" data-setting="floodRate">' +
    '<option value="20">20 / sec</option>' +
    '<option value="50">50 / sec</option>' +
    '<option value="100">100 / sec</option>' +
    '<option value="200">200 / sec</option>' +
    '</select></div>' +
    '</div>' +
    '<div class="ssec">' +
    '<div class="ssec-title">Watch</div>' +
    '<div class="srow" title="Minimum time that must pass before Racna re-alerts you about the same error"><span>Repeat alert delay <em>suppress repeats within window</em></span>' +
    '<select class="sselect" data-setting="watchCooldownSecs">' +
    '<option value="0">Off (always notify)</option>' +
    '<option value="15">15 seconds</option>' +
    '<option value="30">30 seconds</option>' +
    '<option value="60">1 minute</option>' +
    '<option value="300">5 minutes</option>' +
    '</select></div>' +
    '</div>' +
    '<div class="ssec">' +
    '<div class="ssec-title">About</div>' +
    '<div class="srow"><span>Racna' +
    versionLabel +
    '</span>' +
    '<a class="scredit" href="https://github.com/Niki-Mozzon" target="_blank" rel="noopener noreferrer">by Niki Mozzon</a></div>' +
    '</div>' +
    '</div>' +
    '<div id="stab-rules" class="stab-panel modal-body smodal-body" style="display:none">' +
    '<div class="ssec">' +
    '<div class="ssec-title">Ignore Rules</div>' +
    '<div id="smodal-ignore-rules"></div>' +
    '</div>' +
    '<div class="ssec">' +
    '<div class="ssec-title">Watch Rules</div>' +
    '<div id="smodal-watch-rules"></div>' +
    '</div>' +
    '</div>' +
    '<div id="stab-sites" class="stab-panel modal-body smodal-body" style="display:none">' +
    '<div class="ssec">' +
    '<div class="ssec-title">Current Site</div>' +
    '<div id="smodal-current-site"></div>' +
    '</div>' +
    '<div class="ssec">' +
    '<div class="ssec-title">Enabled Sites</div>' +
    '<div id="smodal-sites-list"></div>' +
    '</div>' +
    '</div>' +
    '</div>';
  state.settingsModalEl = settingsModalEl;

  settingsModalEl.addEventListener('click', (event) => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    const btn = t.closest<HTMLElement>('[data-action]');
    if (btn) {
      event.stopPropagation();
      handleAction(btn);
      return;
    }
    const tab = t.closest<HTMLElement>('[data-tab]');
    if (tab) {
      const tabName = tab.getAttribute('data-tab');
      if (!tabName) return;
      state.activeSettingsTab = tabName;
      settingsModalEl.querySelectorAll<HTMLElement>('.stab').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-tab') === state.activeSettingsTab);
      });
      settingsModalEl.querySelectorAll<HTMLElement>('.stab-panel').forEach((p) => {
        p.style.display = p.id === 'stab-' + state.activeSettingsTab ? '' : 'none';
      });
      return;
    }
    if (event.target === settingsModalEl) hideSettingsModal();
  });
  settingsModalEl.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLSelectElement)) return;
    if (input instanceof HTMLInputElement && input.hasAttribute('data-site-enabled-tab')) {
      const site = currentSite();
      if (input.checked) {
        if (!state.enabledSites.includes(site)) {
          state.enabledSites = [...state.enabledSites, site];
        }
      } else {
        state.enabledSites = state.enabledSites.filter((h) => h !== site);
      }
      setEnabledSites(state.enabledSites);
      renderBadge();
      renderSettingsModal();
      return;
    }
    const key = input.getAttribute('data-setting') as keyof Settings | null;
    if (!key) return;
    // Checkboxes give a boolean; selects give a string. Numeric selects (e.g.
    // networkMinStatus) coerce to a number, but value-typed selects like `theme`
    // must stay strings, so only coerce when the value is all digits.
    let value: unknown;
    if (input instanceof HTMLInputElement && input.type === 'checkbox') {
      value = input.checked;
    } else {
      const raw = input.value;
      value = /^-?\d+$/.test(raw) ? Number(raw) : raw;
    }
    (state.settings as unknown as Record<string, unknown>)[key] = value;
    setSetting(key, value as Settings[typeof key]);
    if (key === 'theme') applyTheme(value as Settings['theme']);
    if (key === 'position') applyPosition(value as Settings['position']);
    if (key === 'showNetwork') {
      const threshRow = settingsModalEl.querySelectorAll('.srow[data-depends="showNetwork"]');
      threshRow.forEach((row) => row.classList.toggle('sdisabled', !value));
    }
  });

  // ── Rule editor modal ────────────────────────────────────────────────────
  const ruleEditorEl = document.createElement('div');
  ruleEditorEl.className = 'modal-overlay';
  ruleEditorEl.style.display = 'none';
  ruleEditorEl.innerHTML =
    '<div class="modal reeditor">' +
    '<div class="modal-header">' +
    '<span class="modal-title re-title"></span>' +
    '<button class="pbtn pbtn-close" data-action="close-rule-editor">×</button>' +
    '</div>' +
    '<div class="modal-body re-body">' +
    '<div class="re-net-section" style="display:none">' +
    '<div class="re-meta-row"></div>' +
    '<div class="re-chips-label">Path segments: click to wildcard</div>' +
    '<div class="re-path-chips" id="re-path-chips"></div>' +
    '<div class="re-chips-label" id="re-query-label" style="display:none">Query parameters: click to wildcard</div>' +
    '<div class="re-query-chips" id="re-query-chips"></div>' +
    '</div>' +
    '<div class="re-con-section" style="display:none">' +
    '<div class="re-chips-label">Pattern - replace parts with *</div>' +
    '<textarea class="re-console-ta" id="re-console-ta" rows="3" spellcheck="false"></textarea>' +
    '</div>' +
    '<div class="re-preview-label">Pattern preview</div>' +
    '<div class="re-preview" id="re-preview"></div>' +
    '<div class="re-note-label">Note <em>(optional, e.g. a link to a fix PR or ticket)</em></div>' +
    '<textarea class="re-note-ta" id="re-note-ta" rows="2" spellcheck="false" placeholder="Fixed in PR #1234, re-check if this recurs"></textarea>' +
    '</div>' +
    '<div class="re-footer">' +
    '<button class="pbtn re-btn-ignore" data-action="confirm-rule">Create Rule</button>' +
    '<button class="pbtn" data-action="close-rule-editor">Cancel</button>' +
    '</div>' +
    '</div>';
  state.ruleEditorEl = ruleEditorEl;

  ruleEditorEl.addEventListener('click', (event) => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    if (event.target === ruleEditorEl) {
      hideRuleEditor();
      return;
    }
    const btn = t.closest<HTMLElement>('[data-action]');
    if (btn) {
      event.stopPropagation();
      handleAction(btn);
      return;
    }
    // Clicking a URL chip toggles its wildcard. The "★ All" chip and the
    // individual query chips stay in sync: toggling All sets every query chip
    // to match, and the All chip auto-reflects whether every query chip is
    // currently wildcarded.
    const chip = t.closest<HTMLElement>('[data-chip-idx]');
    if (chip) {
      const idxAttr = chip.getAttribute('data-chip-idx');
      const idx = idxAttr ? parseInt(idxAttr, 10) : NaN;
      const seg = state.ruleEditorSegments[idx];
      if (!seg) return;
      if (seg.kind === 'query-all') {
        const newState = !seg.wildcard;
        seg.wildcard = newState;
        for (const s of state.ruleEditorSegments) {
          if (s.kind === 'query-val') s.wildcard = newState;
        }
      } else if (seg.kind === 'query-val') {
        seg.wildcard = !seg.wildcard;
        const allChip = state.ruleEditorSegments.find((s) => s.kind === 'query-all');
        if (allChip) {
          const allWild = state.ruleEditorSegments
            .filter((s) => s.kind === 'query-val')
            .every((s) => s.wildcard);
          allChip.wildcard = allWild;
        }
      } else {
        seg.wildcard = !seg.wildcard;
      }
      renderRuleEditor();
    }
  });

  ruleEditorEl.addEventListener('input', (event) => {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement && target.id === 're-console-ta') {
      state.ruleEditorConsolePattern = target.value;
      const previewEl = ruleEditorEl.querySelector('#re-preview');
      if (previewEl) previewEl.textContent = state.ruleEditorConsolePattern || '(empty)';
    }
  });

  state.shadow.appendChild(styleEl);
  state.shadow.appendChild(root);
  state.shadow.appendChild(modalEl);
  state.shadow.appendChild(settingsModalEl);
  state.shadow.appendChild(ruleEditorEl);
}

/** Wire the inbound event channels: interceptor events over postMessage,
 *  SPA-navigation clearing, and the popup's "open settings" runtime message. */
function wireMessageListeners(): void {
  // The page and other extensions post to window too, so we gate on our own
  // MSG_TYPE tag before treating the data as an interceptor payload.
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (typeof data !== 'object' || data === null) return;
    const type = (data as { type?: unknown }).type;
    if (type === MSG_TYPE) {
      addEntry(data as InterceptorPayload);
    } else if (type === NAV_TYPE) {
      // pushState/replaceState navigations, which fire no popstate; relayed
      // from the MAIN-world interceptor (see navigation.ts).
      clearOnNavigation();
    }
  });

  // Back/forward and hash navigations fire these natively in this world; SPA
  // pushState/replaceState arrive as NAV_TYPE messages above. Both funnel into
  // the same clear-on-navigation handler.
  const navEvents: readonly (keyof WindowEventMap)[] = ['popstate', 'hashchange'];
  for (const evt of navEvents) {
    window.addEventListener(evt, clearOnNavigation);
  }

  // The popup talks to us via chrome.runtime. Guarded because chrome.runtime is
  // undefined in some contexts (e.g. sandboxed frames) and accessing it throws.
  try {
    chrome.runtime.onMessage.addListener(
      (msg: unknown, _sender, sendResponse: (response?: unknown) => void) => {
        if (typeof msg !== 'object' || msg === null) return;
        const type = (msg as { type?: unknown }).type;
        if (type === OPEN_SETTINGS_TYPE) {
          showSettingsModal();
        } else if (type === STATUS_TYPE) {
          // The popup asks whether Racna is active here. We answer with our own
          // currentSite() so there's no duplicated host-key logic in the popup.
          const site = currentSite();
          const response: StatusResponse = {
            site,
            siteEnabled: state.enabledSites.includes(site),
            enabled: state.settings.enabled,
          };
          sendResponse(response);
        }
      },
    );
  } catch {
    /* chrome.runtime may not be available in all contexts */
  }
}

/** Reflect the chosen colour theme on the shadow host. Dark is the default and
 *  needs no class; light adds `theme-light`, which flips the CSS custom
 *  properties defined in styles.ts so every rule re-themes at once. */
function applyTheme(theme: Settings['theme']): void {
  state.host?.classList.toggle('theme-light', theme === 'light');
}

/** Reflect the chosen corner on the shadow host. Bottom-right is the default
 *  (base CSS); a `pos-*` class flips the .root alignment, the toast anchor, and
 *  the panel's resize-handle side (see styles.ts). */
function applyPosition(position: Settings['position']): void {
  const host = state.host;
  if (!host) return;
  host.classList.remove('pos-bottom-right', 'pos-bottom-left', 'pos-top-right', 'pos-top-left');
  host.classList.add('pos-' + position);
}

/** Honour the "clear on navigation" setting: wipe the captured list on an SPA
 *  route change. Triggered by native popstate/hashchange and by the
 *  interceptor's pushState/replaceState signal (NAV_TYPE). No-op when the
 *  setting is off. */
function clearOnNavigation(): void {
  if (!state.settings.clearOnNav) return;
  state.entries = [];
  if (state.domReady) render();
}

/** Keep this tab in sync when settings/rules/sites change elsewhere: another
 *  tab on the same page, the popup toggle, or a synced device. Rules/sites get
 *  their own early-return branches (they need a list re-render); any other key
 *  is copied straight into state.settings. The open settings modal is also
 *  refreshed so it never shows stale values. */
function wireStorageSubscription(): void {
  try {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.ignoreRules) {
        state.ignoreRules = (changes.ignoreRules.newValue ?? []) as typeof state.ignoreRules;
        if (state.domReady) renderList();
        if (state.settingsModalEl && state.settingsModalEl.style.display !== 'none') {
          renderSettingsModal();
        }
        return;
      }
      if (changes.watchRules) {
        state.watchRules = (changes.watchRules.newValue ?? []) as typeof state.watchRules;
        if (state.domReady) renderList();
        if (state.settingsModalEl && state.settingsModalEl.style.display !== 'none') {
          renderSettingsModal();
        }
        return;
      }
      if (changes.enabledSites) {
        state.enabledSites = (changes.enabledSites.newValue ?? []) as string[];
        if (state.domReady) render();
        if (state.settingsModalEl && state.settingsModalEl.style.display !== 'none') {
          renderSettingsModal();
        }
        return;
      }
      for (const key of Object.keys(changes)) {
        (state.settings as unknown as Record<string, unknown>)[key] = changes[key]?.newValue;
      }
      if (changes.theme) applyTheme(state.settings.theme);
      if (changes.position) applyPosition(state.settings.position);
      if (changes.aiFormat) updateExportTooltips();
      if (state.domReady) render();
      if (state.settingsModalEl && state.settingsModalEl.style.display !== 'none') {
        renderSettingsModal();
      }
    });
  } catch {
    /* ignore */
  }
}

/** Keep the Export buttons' tooltips in sync with the AI format flag. The
 *  flag lives in the entry modal, so without this the panel would give no
 *  hint about which format a bulk export will produce. */
function updateExportTooltips(): void {
  const suffix = state.settings.aiFormat ? ' (AI format)' : '';
  const all = state.headerEl?.querySelector<HTMLElement>('#en-export');
  if (all) all.title = 'Export all visible errors to a Markdown file' + suffix;
  const picked = state.selectionBarEl?.querySelector<HTMLElement>('#en-export-selected');
  if (picked) picked.title = 'Export the selected errors to a Markdown file' + suffix;
}

/** Load persisted state from storage into the live `state` and repaint. Failure
 *  is non-fatal; we keep the in-memory defaults rather than blocking startup. */
async function bootstrapState(): Promise<void> {
  try {
    const data = await loadBootstrap(DEFAULTS);
    state.settings = data.settings;
    state.ignoreRules = data.ignoreRules;
    state.watchRules = data.watchRules;
    state.enabledSites = data.enabledSites;
    applyTheme(state.settings.theme);
    applyPosition(state.settings.position);
    updateExportTooltips();
    if (state.domReady) render();
  } catch {
    /* fall back to defaults */
  }
}

/**
 * Mount the overlay. A full-viewport fixed host with the maximum z-index keeps
 * us above any page content; `pointerEvents: none` on the host means the page
 * stays fully clickable through our empty areas. The actual UI elements
 * re-enable pointer events on themselves in CSS. A shadow root isolates our
 * styles from the page entirely.
 *
 * Order: build the DOM, mark it ready (so async renders are safe), kick off the
 * async storage load, wire listeners, and do a first paint immediately so the
 * badge can appear before storage resolves.
 */
function init(): void {
  state.host = document.createElement('div');
  state.host.setAttribute('id', 'racna-shadow-host');
  Object.assign(state.host.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647', // max 32-bit signed int so we sit above everything on the page
    pointerEvents: 'none',
  });

  document.documentElement.appendChild(state.host);
  state.shadow = state.host.attachShadow({ mode: 'open' });
  buildUI();
  state.domReady = true;
  void bootstrapState(); // async; render() below covers the pre-load paint
  wireMessageListeners();
  wireStorageSubscription();
  render();
}

// Inject at document_start can land before the DOM exists; wait for it if so.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
