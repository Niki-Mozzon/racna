// Wire vocabulary shared across the three contexts. Every cross-context
// message carries one of these `type` tags so a receiver can recognise a
// Racna message and ignore unrelated traffic on the same channel (the page,
// other extensions, and the browser all post to `window`).

// interceptor (MAIN world) → overlay: a captured event (console/error/network).
export const MSG_TYPE = '__RACNA__' as const;
// overlay → interceptor (MAIN world): "re-print stored args id N to the console".
export const REPLAY_TYPE = '__RACNA_REPLAY__' as const;
// popup → overlay (via chrome.tabs.sendMessage): "open the settings modal".
export const OPEN_SETTINGS_TYPE = '__RACNA_OPEN_SETTINGS__' as const;
// interceptor (MAIN world) → overlay: the SPA location changed via
// history.pushState/replaceState (which, unlike back/forward, fire no
// `popstate`). Lets the overlay honour "clear on navigation" for SPA routing.
export const NAV_TYPE = '__RACNA_NAV__' as const;
// popup → overlay (via chrome.tabs.sendMessage): "report your status for this
// tab". The overlay replies with a StatusResponse (see types.ts) so the popup
// can flag whether Racna is active on the current page.
export const STATUS_TYPE = '__RACNA_STATUS__' as const;

export type MsgType = typeof MSG_TYPE;
export type ReplayType = typeof REPLAY_TYPE;
export type OpenSettingsType = typeof OPEN_SETTINGS_TYPE;
export type NavType = typeof NAV_TYPE;
export type StatusType = typeof STATUS_TYPE;
