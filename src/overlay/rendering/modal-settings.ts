// The settings modal has three tabs: Settings (the display/behaviour toggles),
// Rules (ignore + watch rule lists with editable notes), and Sites (per-host
// enable list). Rendering reads from `state`; the actual toggle handlers live
// in index.ts (change events) and actions.ts (button clicks).

import { STICKY_NOTE } from '../constants.js';
import { currentSite, state } from '../state.js';
import { escAttr, escHtml, linkifyHtml, ruleKindIcon, siteLabel } from '../util.js';

import type { Rule, Settings } from '../../shared/types.js';

type RuleListType = 'ignore' | 'watch';

/** Render one rule row for the ignore/watch lists: a per-kind icon, the pattern
 *  description, an optional note badge, then Edit rule / Delete. The ignore/watch
 *  split changes only the delete action name and data-attr. */
function renderRuleRow(r: Rule, listType: RuleListType): string {
  const iconCls = listType === 'watch' ? 'watch' : r.kind === 'network' ? 'net' : 'cons';
  const desc =
    r.kind === 'network'
      ? (r.pattern ?? '') + (r.status != null ? ' [' + String(r.status) + ']' : '')
      : '"' + (r.pattern ?? '') + '"';
  const delAction = listType === 'ignore' ? 'del-ignore-rule' : 'del-watch-rule';
  const delAttr = listType === 'ignore' ? 'data-rule-id' : 'data-watch-rule-id';
  const note = r.note ?? '';
  const noteHtml = note ? '<div class="srule-note">' + linkifyHtml(note) + '</div>' : '';
  const noteBadge = note
    ? '<span class="srule-note-badge" title="Has a note">' + STICKY_NOTE + '</span>'
    : '';

  return (
    '<div class="srule-row" data-rule-row-id="' +
    escAttr(r.id) +
    '">' +
    '<div class="srule-line">' +
    '<span class="srule-icon ' +
    iconCls +
    '">' +
    ruleKindIcon(r.kind) +
    '</span>' +
    '<span class="srule-desc" title="' +
    escAttr(desc) +
    '">' +
    escHtml(desc) +
    '</span>' +
    noteBadge +
    '<button class="pbtn srule-edit" data-action="edit-rule" data-rule-id="' +
    escAttr(r.id) +
    '" data-rule-list="' +
    listType +
    '">Edit rule</button>' +
    '<button class="pbtn srule-del" data-action="' +
    delAction +
    '" ' +
    delAttr +
    '="' +
    escAttr(r.id) +
    '">Delete</button>' +
    '</div>' +
    noteHtml +
    '</div>'
  );
}

/** Render the Sites tab: a toggle for the current host plus the full list of
 *  enabled hosts, each with a Remove button. */
function renderSitesTab(): void {
  const modal = state.settingsModalEl;
  if (!modal) return;
  const currentSiteEl = modal.querySelector('#smodal-current-site');
  const listEl = modal.querySelector('#smodal-sites-list');
  if (!currentSiteEl || !listEl) return;

  const site = currentSite();
  const isEnabled = state.enabledSites.includes(site);
  currentSiteEl.innerHTML =
    '<div class="srow">' +
    '<span>' +
    escHtml(siteLabel(site)) +
    '</span>' +
    '<label class="sswitch" title="Enable Racna on this site">' +
    '<input type="checkbox" data-site-enabled-tab' +
    (isEnabled ? ' checked' : '') +
    '><span class="sslider"></span>' +
    '</label>' +
    '</div>';

  if (state.enabledSites.length === 0) {
    listEl.innerHTML = '<div class="srules-empty">No sites enabled</div>';
  } else {
    listEl.innerHTML = state.enabledSites
      .map(
        (h) =>
          '<div class="srule-row">' +
          '<div class="srule-line">' +
          '<span class="srule-desc">' +
          escHtml(siteLabel(h)) +
          '</span>' +
          '<button class="pbtn srule-del" data-action="del-site" data-hostname="' +
          escAttr(h) +
          '">Remove</button>' +
          '</div>' +
          '</div>',
      )
      .join('');
  }
}

/** Sync the whole settings modal from `state`: reflect every toggle/select
 *  from settings, grey out the network-status row when network capture is off,
 *  then repaint the sites tab and both rule lists. Called after any change so
 *  the modal always mirrors state. The form controls are declared in the HTML
 *  built by index.ts and located here by their data-setting key. */
export function renderSettingsModal(): void {
  const modal = state.settingsModalEl;
  if (!modal) return;
  const cbs = modal.querySelectorAll<HTMLInputElement>('input[data-setting]');
  cbs.forEach((cb) => {
    const key = cb.getAttribute('data-setting') as keyof Settings | null;
    if (key) cb.checked = Boolean(state.settings[key]);
  });
  const sels = modal.querySelectorAll<HTMLSelectElement>('select[data-setting]');
  sels.forEach((sel) => {
    const key = sel.getAttribute('data-setting') as keyof Settings | null;
    if (key) {
      const value = state.settings[key];
      sel.value = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
    }
  });
  const threshRow = modal.querySelectorAll('.srow[data-depends="showNetwork"]');
  threshRow.forEach((row) => row.classList.toggle('sdisabled', !state.settings.showNetwork));
  renderSitesTab();

  const ignoreContainer = modal.querySelector('#smodal-ignore-rules');
  if (ignoreContainer) {
    if (state.ignoreRules.length === 0) {
      ignoreContainer.innerHTML = '<div class="srules-empty">No ignore rules</div>';
    } else {
      ignoreContainer.innerHTML = state.ignoreRules.map((r) => renderRuleRow(r, 'ignore')).join('');
    }
  }

  const watchContainer = modal.querySelector('#smodal-watch-rules');
  if (watchContainer) {
    if (state.watchRules.length === 0) {
      watchContainer.innerHTML = '<div class="srules-empty">No watch rules</div>';
    } else {
      watchContainer.innerHTML = state.watchRules.map((r) => renderRuleRow(r, 'watch')).join('');
    }
  }
}

/** Open the settings modal, always resetting to the Settings tab. */
export function showSettingsModal(): void {
  if (!state.settingsModalEl) return;
  state.activeSettingsTab = 'settings';
  state.settingsModalEl.querySelectorAll<HTMLElement>('.stab').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-tab') === 'settings');
  });
  state.settingsModalEl.querySelectorAll<HTMLElement>('.stab-panel').forEach((p) => {
    p.style.display = p.id === 'stab-settings' ? '' : 'none';
  });
  renderSettingsModal();
  state.settingsModalEl.style.display = '';
}

/** Close the setting modal. */
export function hideSettingsModal(): void {
  if (!state.settingsModalEl) return;
  state.settingsModalEl.style.display = 'none';
}
