// MAIN-world breadcrumb trail: a small ring buffer of recent activity (logs,
// navigations, clicks, HTTP) that gets snapshotted onto every captured event
// so the overlay can show "what happened just before this error".

import type { Breadcrumb } from '../shared/types.js';

const CRUMB_MAX = 25; // Keep only the most recent N; this is context, not a full log.
const breadcrumbs: Breadcrumb[] = [];

export function addCrumb(crumb: Breadcrumb): void {
  breadcrumbs.push(crumb);
  if (breadcrumbs.length > CRUMB_MAX) breadcrumbs.shift(); // drop oldest, FIFO
}

/** Return a *copy* so callers can attach it to a message without it mutating
 *  as new crumbs arrive afterwards. */
export function snapshotCrumbs(): Breadcrumb[] {
  return breadcrumbs.slice();
}

/**
 * Build a short, human-readable label for a clicked element, e.g.
 * `button#save .primary "Save changes"`. Deliberately lossy: we keep only the
 * id *or* first class and clip text to 40 chars, since a breadcrumb should be a
 * glance-able hint, not a full selector.
 */
function describeClickTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  let desc = target.tagName.toLowerCase();
  if (target.id) {
    desc += '#' + target.id;
  } else {
    const className = target.className;
    if (typeof className === 'string' && className.trim()) {
      const firstClass = className.trim().split(/\s+/)[0];
      if (firstClass) desc += '.' + firstClass;
    }
  }
  const textContent = target.textContent;
  if (textContent) {
    const text = textContent.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (text) desc += ' "' + text + '"';
  }
  return desc;
}

/** Start recording nav and click crumbs. (Log crumbs come from console.ts and
 *  HTTP crumbs from network.ts, which call addCrumb directly.) */
export function initBreadcrumbs(): void {
  // popstate/hashchange cover SPA route changes; a full page load restarts the
  // script so there's no crumb to record for it.
  const navEvents: readonly (keyof WindowEventMap)[] = ['popstate', 'hashchange'];
  for (const evt of navEvents) {
    window.addEventListener(evt, () => {
      addCrumb({ type: 'nav', message: window.location.href, timestamp: Date.now() });
    });
  }

  // Capture phase so we still see the click even if a handler calls
  // stopPropagation() on it.
  document.addEventListener(
    'click',
    (e) => {
      const desc = describeClickTarget(e.target);
      if (desc !== null) {
        addCrumb({ type: 'click', message: desc, timestamp: Date.now() });
      }
    },
    true,
  );
}
