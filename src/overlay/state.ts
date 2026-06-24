// Single source of truth for the overlay (ISOLATED world). Everything mutable
// the UI reads lives on the one exported `state` object; modules import it,
// read/mutate it, and call the render functions. There is no reactive layer:
// rendering is explicit. Persistence is separate (storage.ts); `state` is the
// in-memory mirror, hydrated at startup and on storage changes.

import { FLOOD_RATE } from './constants.js';

import type { Entry, IgnoreRule, Rule, Settings, WatchRule } from '../shared/types.js';

// One clickable token in the rule editor's URL builder: each path segment and
// query param becomes a segment the user can wildcard. See rules/editor.ts.
export type EditorSegmentKind = 'path' | 'query-val' | 'query-all';

export interface EditorSegment {
  value: string;
  wildcard: boolean; // user toggled this segment to `*`
  kind: EditorSegmentKind;
  key?: string; // for query params
  val?: string;
}

/** The key identifying the current page in the per-site enable list. Normal
 *  pages use their hostname; hostless URLs (file://, about:, data:) have an
 *  empty hostname, so we fall back to the protocol (e.g. "file://") to give them
 *  a stable, non-empty key. An empty key would render as a blank row in the
 *  Sites list and silently gate capture on "". */
export function currentSite(): string {
  return window.location.hostname || window.location.protocol + '//';
}

/** True when the captured-entry buffer is full. At the cap we stop storing new
 *  entries (addEntry) rather than evicting older ones, since at this volume it's
 *  almost always a dedup-collapsed cycle or a burst the user triages from the
 *  first few. The panel shows a notice and the badge pulses; Clear (or a reload)
 *  resumes capture. */
export function atEntryCap(): boolean {
  return state.entries.length >= (state.settings.maxEntries || 100);
}

// Factory defaults, also used as the `chrome.storage.sync.get` default map so
// a fresh install (or a missing key) reads sensible values. Spread a copy when
// seeding state. Never mutate this object.
export const DEFAULTS: Settings = {
  enabled: true,
  theme: 'dark',
  position: 'bottom-right',
  showConsoleErrors: true,
  showConsoleWarns: false,
  showNetwork: true,
  showNetworkFailures: true,
  networkMinStatus: 400,
  clearOnNav: false,
  maxEntries: 100,
  floodRate: FLOOD_RATE,
  watchCooldownSecs: 30,
  copyFields: {
    pageUrl: true,
    userAgent: true,
    seen: true,
    breadcrumbs: true,
    message: true,
    stack: true,
    location: true,
    request: true,
    requestHeaders: true,
    requestBody: true,
    response: true,
    responseHeaders: true,
    responseBody: true,
    callStack: true,
  },
  aiFormat: false,
  redactSensitive: true,
  collapsedFields: {},
};

// Three categories live side by side here: (1) persisted data mirrored from
// storage, (2) DOM element handles created once during bootstrap, and (3)
// transient UI state that's never persisted. The blank lines below group them.
export interface OverlayState {
  // ── Persisted data (mirror of chrome.storage.sync) ──
  settings: Settings;
  ignoreRules: IgnoreRule[];
  watchRules: WatchRule[];
  enabledSites: string[]; // hostnames where the overlay is active

  // ── Captured entries ──
  entries: Entry[];
  nextId: number; // monotonic id source for new entries
  isExpanded: boolean; // panel open vs collapsed to the badge
  hasUnseen: boolean; // drives the badge's unseen indicator
  domReady: boolean; // gate rendering until the shadow DOM exists
  watchToastTimes: Record<string, number>; // ruleId → last-fired ts, for cooldown

  // ── DOM handles (built once in index.ts) ──
  host: HTMLElement | null;
  shadow: ShadowRoot | null;
  badgeEl: HTMLElement | null;
  panelEl: HTMLElement | null;
  listEl: HTMLElement | null;
  headerEl: HTMLElement | null;
  selectionBarEl: HTMLElement | null;

  // ── Transient UI state (never persisted) ──
  selectionMode: boolean; // multi-select for bulk export
  selectedIds: Set<number>;

  modalEl: HTMLElement | null; // entry detail modal
  modalBodyEl: HTMLElement | null;
  currentModalEntry: Entry | null;

  settingsModalEl: HTMLElement | null;
  activeSettingsTab: string; // which settings tab is showing

  toastEl: HTMLElement | null; // watch-rule notification
  toastEntry: Entry | null;

  // Flood guard: when a runaway error loop trips the rate limit, capture pauses
  // (the snapshot freezes). The pause shows as an in-panel notice with Resume
  // and the badge blinks. See flood-banner.ts / panel.ts.
  floodPaused: boolean;
  floodDropped: number; // events dropped since the flood pause began
  capDropped: number; // events dropped since the entry buffer hit the cap (reset on Clear)

  // Rule editor sub-state mirroring the in-progress rule being built/edited.
  ruleEditorEl: HTMLElement | null;
  ruleEditorType: '' | 'ignore' | 'watch';
  ruleEditorEntry: Entry | null;
  ruleEditorSegments: EditorSegment[];
  ruleEditorConsolePattern: string;
  ruleEditorRule: Rule | null; // existing rule being edited (rule mode), or the conflict match
  ruleEditorBlink: boolean; // true when opened on a conflict, to hint the toggle
}

// The live singleton. Initial values are pre-bootstrap placeholders; index.ts
// overwrites the persisted ones from storage on startup.
export const state: OverlayState = {
  settings: { ...DEFAULTS },
  ignoreRules: [],
  watchRules: [],
  enabledSites: ['localhost', '127.0.0.1'],
  entries: [],
  nextId: 0,
  isExpanded: false,
  hasUnseen: false,
  domReady: false,
  watchToastTimes: {},

  host: null,
  shadow: null,
  badgeEl: null,
  panelEl: null,
  listEl: null,
  headerEl: null,
  selectionBarEl: null,

  selectionMode: false,
  selectedIds: new Set(),

  modalEl: null,
  modalBodyEl: null,
  currentModalEntry: null,

  settingsModalEl: null,
  activeSettingsTab: 'settings',

  toastEl: null,
  toastEntry: null,

  floodPaused: false,
  floodDropped: 0,
  capDropped: 0,

  ruleEditorEl: null,
  ruleEditorType: '',
  ruleEditorEntry: null,
  ruleEditorSegments: [],
  ruleEditorConsolePattern: '',
  ruleEditorRule: null,
  ruleEditorBlink: false,
};
