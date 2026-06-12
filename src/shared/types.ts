// Shared data contracts for the whole extension. These types cross the
// boundary between tiers: the interceptor (MAIN world) builds the `*Message`
// payloads and posts them; the overlay (ISOLATED world) consumes them, turns
// them into `Entry` rows, and owns the persisted `Settings`/`Rule` shapes.
// Keep this file free of runtime code. It is the single source of truth both
// sides import from.

import type { MsgType, NavType, ReplayType } from './protocol.js';

/** What produced an event. Network is the odd one out (no console `level`). */
export type EntryKind = 'console' | 'uncaught' | 'rejection' | 'network';
/** Console severities we wrap. error/warn are captured; the rest are crumb-only. */
export type ConsoleLevel = 'error' | 'warn' | 'log' | 'info' | 'debug';
export type BreadcrumbType = 'log' | 'nav' | 'click' | 'http';

// Breadcrumbs are the short rolling trail of recent activity (logs, navs,
// clicks, HTTP) attached to every captured event so a maintainer reading an
// error later can see what led up to it. The interceptor records them; they
// ride along inside each message's `breadcrumbs` array.

interface BreadcrumbBase {
  timestamp: number;
}

export interface LogBreadcrumb extends BreadcrumbBase {
  type: 'log';
  level: ConsoleLevel;
  message: string;
}

export interface NavBreadcrumb extends BreadcrumbBase {
  type: 'nav';
  message: string;
}

export interface ClickBreadcrumb extends BreadcrumbBase {
  type: 'click';
  message: string;
}

export interface HttpBreadcrumb extends BreadcrumbBase {
  type: 'http';
  message: string;
}

export type Breadcrumb = LogBreadcrumb | NavBreadcrumb | ClickBreadcrumb | HttpBreadcrumb;

/** Header bag, normalised to a plain object. `null` means "none captured". */
export type Headers = Record<string, string> | null;

// ── Interceptor → overlay messages ──────────────────────────────────────────
// A discriminated union keyed on `kind`. The interceptor posts these over
// window.postMessage; the overlay narrows on `kind` to read the right fields.

interface InterceptorMessageBase {
  type: MsgType;
  /** Index into the interceptor's replay store; lets the overlay ask for the
   *  original (unclonable) console args back. Optional only on the base;
   *  every concrete message that has args makes it required. */
  storeId?: number;
  pageUrl: string;
  breadcrumbs: Breadcrumb[];
  timestamp: number;
}

/** A captured `console.error()` / `console.warn()` call. */
export interface ConsoleMessage extends InterceptorMessageBase {
  kind: 'console';
  level: 'error' | 'warn';
  message: string;
  // Synthetic stack (`new Error().stack`) captured at the wrap site, since
  // console calls have no stack of their own.
  stack: string | null;
  storeId: number;
}

/** An uncaught error from the global `error` event. Carries the source
 *  location the browser gives us (filename/lineno), which the others lack. */
export interface UncaughtMessage extends InterceptorMessageBase {
  kind: 'uncaught';
  level: 'error';
  message: string;
  filename: string | null;
  lineno: number | null;
  stack: string | null;
  storeId: number;
}

/** An unhandled promise rejection (`unhandledrejection` event). */
export interface RejectionMessage extends InterceptorMessageBase {
  kind: 'rejection';
  level: 'error';
  message: string;
  stack: string | null;
  storeId: number;
}

/** A failed network call (XHR or fetch). Only non-OK responses (status 0 or
 *  >= 400) are posted (see network.ts). No `storeId`: there are no live console
 *  args to replay. */
export interface NetworkMessage extends InterceptorMessageBase {
  kind: 'network';
  method: string;
  url: string;
  status: number; // 0 == request never completed (CORS, offline, blocked).
  statusText: string;
  reqHeaders: Headers;
  reqBody: string | null;
  resHeaders: Headers;
  resBody: string | null;
  stack: string | null; // Synthetic stack of the call site that issued the request.
  duration: number; // Wall-clock ms from send to loadend.
}

export type InterceptorMessage =
  | ConsoleMessage
  | UncaughtMessage
  | RejectionMessage
  | NetworkMessage;

// `Omit` over a union collapses it to the shared keys; the distributive form
// preserves each member so the discriminated union still narrows on `kind`.
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
/** A message without its `type` tag: what `post()` accepts before stamping
 *  the tag on, and what the overlay passes around internally. */
export type InterceptorPayload = DistributiveOmit<InterceptorMessage, 'type'>;

/** overlay → interceptor: re-print the original args stored under `storeId`. */
export interface ReplayMessage {
  type: ReplayType;
  storeId: number;
}

/** interceptor → overlay: an SPA navigation (history.pushState/replaceState)
 *  changed the URL. Carries the new href for context; the overlay decides
 *  whether to act on it (clear-on-navigation). */
export interface NavMessage {
  type: NavType;
  href: string;
}

/** overlay → popup: reply to a STATUS_TYPE query, describing whether Racna is
 *  active on the current page. `site` is the per-site enable key (currentSite);
 *  `siteEnabled` is its membership in the enable list; `enabled` is the master
 *  switch. The popup shows it active only when both are true. */
export interface StatusResponse {
  site: string;
  siteEnabled: boolean;
  enabled: boolean;
}

// ── Overlay-side types ─────────────────────────────────────────────────────

export type RuleKind = 'network' | 'console';
export type RuleType = 'ignore' | 'watch';

/** A user-defined match rule. The same shape backs both ignore rules (hide
 *  matching events) and watch rules (toast on matching events). Matching is in
 *  rules/matching.ts. The optional fields are mutually exclusive by `kind`:
 *  - `pattern` present → glob match (on URL path+search for network, on the
 *    message for console). Takes precedence over the exact fields below.
 *  - otherwise: network rules match `urlPath` + `status` exactly; console
 *    rules match a case-insensitive `messageContains` substring. */
export interface Rule {
  id: string;
  kind: RuleKind;
  pattern?: string;
  status?: number;
  urlPath?: string;
  messageContains?: string;
  note?: string; // Free-text reminder shown in the rules list.
  createdAt: number;
}

export type IgnoreRule = Rule;
export type WatchRule = Rule;

// Copy fields control which fields land on the clipboard / in an export.
// `CopyFieldKey` enumerates every toggleable field.
export type CopyFieldKey =
  | 'pageUrl'
  | 'userAgent'
  | 'seen'
  | 'breadcrumbs'
  | 'message'
  | 'stack'
  | 'location'
  | 'request'
  | 'requestHeaders'
  | 'requestBody'
  | 'response'
  | 'responseHeaders'
  | 'responseBody'
  | 'callStack';

/** The user's live field toggles (which fields the detail view copies). */
export type CopyFields = Partial<Record<CopyFieldKey, boolean>>;

/** All persisted, cross-device-synced user settings (chrome.storage.sync).
 *  Read at startup and on the storage `onChanged` event; see storage.ts. */
export interface Settings {
  enabled: boolean; // Master switch; also toggled from the popup.
  theme: 'dark' | 'light'; // Overlay colour theme; applied as a class on the shadow host.
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'; // Corner the badge/panel/toast anchor to.
  showConsoleErrors: boolean;
  showConsoleWarns: boolean;
  showNetwork: boolean;
  showNetworkFailures: boolean; // Capture requests that never got a response (status 0: offline, DNS, CORS, abort).
  networkMinStatus: number; // 400 = client+server errors, 500 = server only; applies to HTTP statuses, not network failures.
  clearOnNav: boolean; // Wipe entries on SPA navigation.
  maxEntries: number; // Capture cap; once full, new entries are dropped (oldest kept) until Clear.
  floodRate: number; // Pause capture above this many events/sec (runaway-loop guard).
  watchCooldownSecs: number; // Min gap between toasts for the same watch rule (0 = none).
  copyFields: CopyFields; // Live per-field copy toggles.
  aiFormat: boolean; // Copy/export tailored for AI tools (error-first, delimited, redacted) vs plain Markdown.
  collapsedFields: Partial<Record<CopyFieldKey, boolean>>; // Which detail sections are folded.
}

/** A row in the overlay's list: one captured event, normalised across all
 *  kinds. Built from an InterceptorPayload by entries.ts. It is a *flat
 *  superset* of every message kind (network-only fields are `null` on console
 *  rows and vice-versa), so rendering code can read any field without
 *  re-narrowing on `kind`. */
export interface Entry {
  id: number; // Overlay-local sequence id (distinct from `storeId`).
  kind: EntryKind;
  level: ConsoleLevel | 'error';
  message: string;
  // Network-only fields (null for console/uncaught/rejection):
  url: string | null;
  method: string | null;
  status: number | null;
  statusText: string | null;
  // Source location fields, carried only by `uncaught`:
  filename: string | null;
  lineno: number | null;
  stack: string | null;
  // Link back to the interceptor's replay store; null for network rows.
  storeId: number | null;
  reqHeaders: Headers;
  reqBody: string | null;
  resHeaders: Headers;
  resBody: string | null;
  duration: number | undefined;
  pageUrl: string | null;
  breadcrumbs: Breadcrumb[] | null;
  // Dedup bookkeeping: identical events within DEDUP_MS collapse into one row.
  // `firstSeen` is pinned at the first occurrence, `timestamp` tracks the
  // latest, and `count` is how many times it has fired. See entries.ts.
  firstSeen: number;
  timestamp: number;
  count: number;
}
