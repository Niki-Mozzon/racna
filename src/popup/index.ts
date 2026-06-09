// Browser-action popup. A tiny standalone document (popup.html) with three
// controls: a master enable toggle, a per-site toggle for the current page, and
// a button that tells the active tab's overlay to open its settings modal. All
// three write chrome.storage.sync / message the tab; the overlay's storage
// subscription picks up the changes live.

import { OPEN_SETTINGS_TYPE, STATUS_TYPE } from '../shared/protocol.js';

import type { StatusResponse } from '../shared/types.js';

// Mirror of the bootstrap default (storage.ts) so toggling a default-enabled
// site like localhost off actually removes it from the stored list.
const DEFAULT_SITES = ['localhost', '127.0.0.1'];

const enabledEl = document.getElementById('enabled');
const siteRowEl = document.getElementById('site-row');
const siteToggleEl = document.getElementById('site-enabled');
const siteLabelEl = siteRowEl?.querySelector('.site-label');

// The current page's per-site enable key, learned from the overlay's reply.
// Null until we hear back, or when no overlay runs on the page (chrome://, etc.).
let currentSite: string | null = null;

// Master enable toggle: read the persisted value on open, write on every change.
// Defaulting the get to { enabled: true } means a fresh install shows "on".
if (enabledEl instanceof HTMLInputElement) {
  chrome.storage.sync.get({ enabled: true }, (r: { enabled?: boolean }) => {
    enabledEl.checked = r.enabled !== false;
  });

  enabledEl.addEventListener('change', () => {
    void chrome.storage.sync.set({ enabled: enabledEl.checked });
  });
}

/** Fill in the per-site row. Disabled (and dimmed) when no overlay is reachable,
 *  since we can't know the site key to toggle. */
function setSiteRow(label: string, checked: boolean, available: boolean): void {
  if (siteLabelEl) siteLabelEl.textContent = label;
  if (siteToggleEl instanceof HTMLInputElement) {
    siteToggleEl.checked = checked;
    siteToggleEl.disabled = !available;
  }
  siteRowEl?.classList.toggle('unavailable', !available);
}

// Ask the active tab's overlay for the site key and its current membership.
// Using its reply (rather than reading the tab URL here) keeps the host-key
// logic in one place and needs no extra permission.
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const first = tabs[0];
  if (!first?.id) {
    setSiteRow('Not available on this page', false, false);
    return;
  }
  chrome.tabs.sendMessage(first.id, { type: STATUS_TYPE }, (resp?: StatusResponse) => {
    if (chrome.runtime.lastError || !resp) {
      setSiteRow('Not available on this page', false, false);
      return;
    }
    currentSite = resp.site;
    setSiteRow(resp.site === 'file://' ? 'local files' : resp.site, resp.siteEnabled, true);
  });
});

// Per-site toggle: add or remove the current site from the enable list. The
// overlay's storage onChanged listener reflects it on the page immediately.
if (siteToggleEl instanceof HTMLInputElement) {
  siteToggleEl.addEventListener('change', () => {
    const site = currentSite;
    if (site === null) return;
    const checked = siteToggleEl.checked;
    chrome.storage.sync.get({ enabledSites: DEFAULT_SITES }, (r: { enabledSites?: string[] }) => {
      const sites = Array.isArray(r.enabledSites) ? r.enabledSites : DEFAULT_SITES;
      const next = checked
        ? Array.from(new Set([...sites, site]))
        : sites.filter((s) => s !== site);
      void chrome.storage.sync.set({ enabledSites: next });
    });
  });
}

// "Open settings": message the overlay running in the active tab (it listens
// for OPEN_SETTINGS_TYPE), then close the popup.
document.getElementById('open-settings')?.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const first = tabs[0];
    if (!first?.id) return;
    chrome.tabs.sendMessage(first.id, { type: OPEN_SETTINGS_TYPE }, () => {
      // Reading lastError suppresses the unchecked-error warning when the
      // content script isn't injected on the active tab (e.g., chrome:// pages)
      if (chrome.runtime.lastError) return;
    });
    window.close();
  });
});
