// Static constants for the overlay: the dedup window, the inline SVG icon set
// (kept as strings so they can be dropped straight into the HTML-string
// rendering), copy-field labels, and the extension logo URL helper.

import type { CopyFieldKey } from '../shared/types.js';

/** Window within which an identical repeat event is merged instead of added as
 *  a new row. See addEntry in entries.ts. */
export const DEDUP_MS = 500;

/** How many of the most-recent entries addEntry scans for a dedup match. Bounds
 *  the hot-path cost while still catching interleaved repeats (A,B,A,B…) that a
 *  last-entry-only check would miss. See addEntry in entries.ts. */
export const DEDUP_LOOKBACK = 10;

/** Flood guard: if more than `settings.floodRate` events are captured within
 *  FLOOD_WINDOW_MS, capture is paused (the snapshot freezes) until the user
 *  resumes. Protects the overlay from runaway error loops. FLOOD_RATE is the
 *  default for the (now user-configurable) rate; the window is fixed so the
 *  threshold reads as "N/sec". See flood-banner.ts / state.ts DEFAULTS. */
export const FLOOD_RATE = 50;
export const FLOOD_WINDOW_MS = 1000;

// All icons are Lucide glyphs (https://lucide.dev, ISC-licensed), delivered as
// inline SVG strings so they drop straight into the HTML-string rendering. They
// share one <svg> wrapper: stroke-based, `currentColor` (so each inherits its
// container's text colour), and sized in `em` so the surrounding `font-size`
// controls the icon size, exactly like the text glyphs they replaced. Each
// export below is just Lucide's inner elements between SVG_HEAD/SVG_TAIL.
const SVG_HEAD =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" ' +
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
const SVG_TAIL = '</svg>';

// ── UI control icons ──

/** Settings (panel header). Lucide `settings`. */
export const GEAR =
  SVG_HEAD +
  '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/>' +
  '<circle cx="12" cy="12" r="3"/>' +
  SVG_TAIL;

/** Watch an error (bell). Lucide `bell`. */
export const BELL =
  SVG_HEAD +
  '<path d="M10.268 21a2 2 0 0 0 3.464 0"/>' +
  '<path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>' +
  SVG_TAIL;

/** Ignore an error (eye-off). Lucide `eye-off`. */
export const EYE_SLASH =
  SVG_HEAD +
  '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/>' +
  '<path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/>' +
  '<path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/>' +
  '<path d="m2 2 20 20"/>' +
  SVG_TAIL;

/** Replay / log-to-console (detail modal). Lucide `terminal`. */
export const CONSOLE_ICON =
  SVG_HEAD + '<path d="M12 19h8"/>' + '<path d="m4 17 6-6-6-6"/>' + SVG_TAIL;

/** Copy all (detail modal). Lucide `copy`. */
export const COPY_ICON =
  SVG_HEAD +
  '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>' +
  '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>' +
  SVG_TAIL;

/** Note badge (settings rule list). Lucide `sticky-note`. */
export const STICKY_NOTE =
  SVG_HEAD +
  '<path d="M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"/>' +
  '<path d="M15 3v5a1 1 0 0 0 1 1h5"/>' +
  SVG_TAIL;

// ── Entry-kind icons (see entryIcon in util.ts) ──

/** Console error. Lucide `circle-x`. */
export const CIRCLE_X =
  SVG_HEAD +
  '<circle cx="12" cy="12" r="10"/>' +
  '<path d="m15 9-6 6"/>' +
  '<path d="m9 9 6 6"/>' +
  SVG_TAIL;

/** Uncaught exception. Lucide `octagon-x`. */
export const OCTAGON_X =
  SVG_HEAD +
  '<path d="m15 9-6 6"/>' +
  '<path d="M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z"/>' +
  '<path d="m9 9 6 6"/>' +
  SVG_TAIL;

/** Unhandled promise rejection. Lucide `unplug`. */
export const UNPLUG =
  SVG_HEAD +
  '<path d="m19 5 3-3"/>' +
  '<path d="m2 22 3-3"/>' +
  '<path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"/>' +
  '<path d="M7.5 13.5 10 11"/>' +
  '<path d="M10.5 16.5 13 14"/>' +
  '<path d="m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z"/>' +
  SVG_TAIL;

/** Failed network request. Lucide `globe`. */
export const GLOBE =
  SVG_HEAD +
  '<circle cx="12" cy="12" r="10"/>' +
  '<path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>' +
  '<path d="M2 12h20"/>' +
  SVG_TAIL;

/** Console warning. Lucide `triangle-alert`. */
export const WARN_ICON =
  SVG_HEAD +
  '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>' +
  '<path d="M12 9v4"/>' +
  '<path d="M12 17h.01"/>' +
  SVG_TAIL;

// Human labels for each copy field, shown in the detail view's field toggles
// and the template editor.
export const COPY_FIELD_LABELS: Record<CopyFieldKey, string> = {
  pageUrl: 'Page URL',
  userAgent: 'Browser',
  seen: 'Seen',
  breadcrumbs: 'Breadcrumbs',
  message: 'Message',
  stack: 'Stack',
  location: 'Location',
  request: 'Request',
  requestHeaders: 'Request Headers',
  requestBody: 'Request Body',
  response: 'Response',
  responseHeaders: 'Response Headers',
  responseBody: 'Response Body',
  callStack: 'Call Stack',
};

/** The extension logo as an <img> tag. chrome.runtime.getURL resolves the
 *  packaged icon to an extension:// URL (the file is declared as a
 *  web_accessible_resource in the manifest so the page context can load it). */
export function getIconImg(): string {
  const iconUrl = chrome.runtime.getURL('icons/icon16.png');
  return '<img class="sicon-logo" src="' + iconUrl + '" alt="">';
}
