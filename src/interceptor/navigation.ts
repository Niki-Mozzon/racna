// MAIN-world history watcher. SPA route changes are driven by
// history.pushState / replaceState, which (unlike the user pressing
// back/forward) fire NO `popstate` event. So neither the breadcrumb trail nor
// the overlay's clear-on-navigation would otherwise notice them. We patch both
// methods to detect programmatic navigations, record a nav breadcrumb, and
// signal the overlay. popstate and hashchange are real events handled natively
// (breadcrumbs.ts records them; the overlay clears on them directly), so we
// deliberately leave those alone here to avoid double-handling.
//
// Patching is observe-only: we always call the original method and return its
// result, so page navigation behaves exactly as before.

import { addCrumb } from './breadcrumbs.js';
import { postNav } from './messaging.js';

type HistoryMethod = 'pushState' | 'replaceState';

export function initNavigation(): void {
  for (const method of ['pushState', 'replaceState'] as HistoryMethod[]) {
    const original = history[method];
    if (typeof original !== 'function') continue;
    history[method] = function patched(
      this: History,
      ...args: Parameters<History['pushState']>
    ): void {
      const before = location.href;
      original.apply(this, args);
      // Only react to an actual URL change. Apps call replaceState for
      // state-only updates (scroll position, filters) where the URL is
      // unchanged; clearing the list on those would be surprising.
      if (location.href !== before) {
        try {
          onNavigated(location.href);
        } catch {
          /* a monitor must never throw into the page it watches */
        }
      }
    } as History[HistoryMethod];
  }
}

function onNavigated(href: string): void {
  addCrumb({ type: 'nav', message: href, timestamp: Date.now() });
  postNav(href);
}
