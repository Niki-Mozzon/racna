// Pure helpers shared across the overlay (rule matching, rendering, export).
// No DOM mutation and no state, so safe to unit-test in isolation.

import { CIRCLE_X, GLOBE, OCTAGON_X, UNPLUG, WARN_ICON } from './constants.js';

import type { Entry } from '../shared/types.js';

/** Human-friendly label for a per-site enable key. Hostnames display as-is; the
 *  hostless `file://` key (see currentSite in state.ts) reads better as
 *  "Local files". The stored key is unchanged; this only affects display. */
export function siteLabel(site: string): string {
  return site === 'file://' ? 'Local files' : site;
}

/** Path portion of a URL, or the raw string if it doesn't parse as a URL. */
export function urlPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function urlPathAndSearch(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

/**
 * The identity used to coalesce repeat events in addEntry. Two events sharing a
 * key (within DEDUP_MS) collapse into one row with a climbing count.
 *
 * Network events key on method + status + path, NOT message, because network
 * messages are always empty, so keying on message would wrongly merge every
 * distinct failing route (route/1, route/2, …) into a single row. Console-style
 * events key on level + message. The shape is intentionally structural so it
 * works on both an incoming InterceptorPayload and a stored Entry.
 */
export function dedupKey(e: {
  kind: string;
  level?: string | null;
  message?: string | null;
  method?: string | null;
  status?: number | null;
  url?: string | null;
}): string {
  if (e.kind === 'network') {
    return `network|${e.method ?? ''}|${e.status ?? ''}|${urlPath(e.url ?? '')}`;
  }
  return `${e.kind}|${e.level ?? ''}|${e.message ?? ''}`;
}

/**
 * Match `str` against a user glob where `*` is the only wildcard.
 *
 * Note the semantics: `*` compiles to `.*`, so it is *greedy and crosses path
 * separators*: `/api/*` matches `/api/v1/users`, not just `/api/users`. This
 * is intentionally simpler than shell globbing (no single-segment `*` vs `**`
 * distinction). Every other regex metacharacter is escaped first, so patterns
 * are taken literally apart from `*`. Matching is anchored (`^…$`) and
 * case-insensitive. A malformed pattern yields `false` rather than throwing.
 */
export function globMatch(pattern: string, str: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  try {
    return new RegExp('^' + escaped + '$', 'i').test(str);
  } catch {
    return false;
  }
}

export function statusClass(status: number | null | undefined): string {
  if (status === 0) return 'serr';
  if (status != null && status >= 500 && status <= 599) return 's5xx';
  if (status != null && status >= 400 && status <= 499) return 's4xx';
  return 'sother';
}

export function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + '…' : str;
}

export function formatTime(ts: number): string {
  try {
    return new Date(ts).toTimeString().slice(0, 8);
  } catch {
    return '';
  }
}

export function nowFilenameTag(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    String(d.getFullYear()) +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    '-' +
    pad(d.getHours()) +
    pad(d.getMinutes())
  );
}

// The panel/modal build their markup as HTML strings, so EVERY value that
// originates from the page (messages, URLs, bodies) MUST pass through escHtml
// (for text content) or escAttr (for attribute values) before being
// interpolated. These are the overlay's only XSS guard, since captured content is
// fully attacker-controlled. Don't interpolate raw entry data without them.
export function escHtml(str: unknown): string {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escAttr(str: unknown): string {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** Escape `text`, then turn bare http(s) URLs in it into safe links. Escaping
 *  happens first so the URL match runs over already-neutralised text. */
export function linkifyHtml(text: string | null | undefined): string {
  const safe = text ?? '';
  const escaped = escHtml(safe);
  return escaped.replace(/(https?:\/\/[^\s<>"']+)/g, (url) => {
    return (
      '<a class="snote-link" href="' +
      escAttr(url) +
      '" target="_blank" rel="noopener noreferrer">' +
      url +
      '</a>'
    );
  });
}

/** Briefly show confirmation text on a button (e.g. "Copied!") then restore
 *  its original content after 2s. Disables the button meanwhile. */
export function feedback(btn: HTMLButtonElement, text: string): void {
  const orig = btn.innerHTML;
  btn.textContent = text;
  btn.disabled = true;
  setTimeout(() => {
    btn.innerHTML = orig;
    btn.disabled = false;
  }, 2000);
}

// ── Entry classifiers (pure; used by panel + toast) ────────────────────────

export function entryClass(e: Entry): 'net' | 'warn' | 'rej' | 'err' {
  if (e.kind === 'network') return 'net';
  if (e.level === 'warn') return 'warn';
  if (e.kind === 'rejection') return 'rej';
  return 'err';
}

export function entryIcon(e: Entry): string {
  if (e.kind === 'network') return GLOBE;
  if (e.kind === 'rejection') return UNPLUG;
  if (e.kind === 'uncaught') return OCTAGON_X;
  if (e.level === 'warn') return WARN_ICON;
  return CIRCLE_X;
}

export function entryTooltip(e: Entry): string {
  if (e.kind === 'uncaught') return 'Uncaught error';
  if (e.kind === 'rejection') return 'Unhandled promise rejection';
  if (e.level === 'warn') return 'Console warning';
  return 'Console error';
}

export function hasExpandableDetail(e: Entry): boolean {
  if (e.kind === 'network') return true;
  return !!(e.stack ?? e.filename ?? e.message);
}
