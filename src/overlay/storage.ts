// Persistence layer over chrome.storage.sync. All settings/rules/templates are
// written here and synced across the user's signed-in browsers. Writes are
// fire-and-forget; the in-memory `state` is the source of truth for the
// current session and the storage `onChanged` listener (in index.ts) re-syncs
// it when another tab or device changes a value.
//
// Every write is wrapped in try/catch because chrome.storage can throw
// synchronously (extension context invalidated, quota exceeded), and a
// failed *persist* must never break the live UI, which already has the value.

import type {
  CopyFields,
  CopyFieldKey,
  CopyTemplate,
  IgnoreRule,
  Settings,
  WatchRule,
} from '../shared/types.js';

/** Persist a single setting by key (keeps the call sites type-safe per key). */
export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  try {
    void chrome.storage.sync.set({ [key]: value });
  } catch {
    /* ignore storage failures */
  }
}

export function setIgnoreRules(rules: IgnoreRule[]): void {
  try {
    void chrome.storage.sync.set({ ignoreRules: rules });
  } catch {
    /* ignore */
  }
}

export function setWatchRules(rules: WatchRule[]): void {
  try {
    void chrome.storage.sync.set({ watchRules: rules });
  } catch {
    /* ignore */
  }
}

export function setEnabledSites(sites: string[]): void {
  try {
    void chrome.storage.sync.set({ enabledSites: sites });
  } catch {
    /* ignore */
  }
}

export function setCopyTemplates(templates: CopyTemplate[]): void {
  try {
    void chrome.storage.sync.set({ copyTemplates: templates });
  } catch {
    /* ignore */
  }
}

export function setCopyFields(fields: CopyFields): void {
  try {
    void chrome.storage.sync.set({ copyFields: fields });
  } catch {
    /* ignore */
  }
}

export function setActiveCopyTemplateIdInStorage(id: string | null): void {
  try {
    void chrome.storage.sync.set({ activeCopyTemplateId: id });
  } catch {
    /* ignore */
  }
}

export function setCollapsedFields(fields: Partial<Record<CopyFieldKey, boolean>>): void {
  try {
    void chrome.storage.sync.set({ collapsedFields: fields });
  } catch {
    /* ignore */
  }
}

/** Everything the overlay needs hydrated at startup, in one shot. */
export interface StorageBootstrap {
  settings: Settings;
  ignoreRules: IgnoreRule[];
  watchRules: WatchRule[];
  enabledSites: string[];
  activeCopyTemplateId: string | null;
}

interface SettingsResult extends Partial<Settings> {
  activeCopyTemplateId?: string | null;
}

interface RulesResult {
  ignoreRules?: IgnoreRule[];
  watchRules?: WatchRule[];
}

interface SitesResult {
  enabledSites?: string[];
}

/** Promisify the callback-based storage.get so loadBootstrap can run the three
 *  reads in parallel with Promise.all. Passing `defaults` to .get() means any
 *  missing key comes back filled in, so the resolved object is always complete.
 *  On a thrown context we resolve to the defaults rather than rejecting;
 *  startup must not hang on a storage hiccup. */
function getFromStorage<T extends object>(defaults: T): Promise<T> {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(defaults, (result) => {
        resolve(result as T);
      });
    } catch {
      resolve(defaults);
    }
  });
}

/** One-shot startup read. Splits the data into three independent .get() calls
 *  (settings, rules, sites) so they fetch concurrently, then merges and
 *  defends each result: nested objects like copyFields are merged over the
 *  defaults so a partial stored value can't drop fields, and arrays are
 *  type-checked before trusting them. */
export async function loadBootstrap(defaults: Settings): Promise<StorageBootstrap> {
  const [settingsResult, rulesResult, sitesResult] = await Promise.all([
    getFromStorage<SettingsResult>({ ...defaults }),
    getFromStorage<RulesResult>({ ignoreRules: [], watchRules: [] }),
    getFromStorage<SitesResult>({ enabledSites: ['localhost', '127.0.0.1'] }),
  ]);

  const settings: Settings = {
    ...defaults,
    ...settingsResult,
    copyFields: {
      ...defaults.copyFields,
      ...(settingsResult.copyFields ?? {}),
    },
    collapsedFields: settingsResult.collapsedFields ?? {},
    copyTemplates: Array.isArray(settingsResult.copyTemplates) ? settingsResult.copyTemplates : [],
  };

  const activeCopyTemplateId =
    typeof settingsResult.activeCopyTemplateId === 'string'
      ? settingsResult.activeCopyTemplateId
      : null;

  return {
    settings,
    ignoreRules: rulesResult.ignoreRules ?? [],
    watchRules: rulesResult.watchRules ?? [],
    enabledSites: Array.isArray(sitesResult.enabledSites)
      ? // Drop empty/blank keys. A legacy "" entry (from toggling a hostless
        // file:// page before it had a stable key) renders as a blank Sites row.
        sitesResult.enabledSites.filter((h) => typeof h === 'string' && h.trim() !== '')
      : ['localhost', '127.0.0.1'],
    activeCopyTemplateId,
  };
}
