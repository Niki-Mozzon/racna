// MAIN-world global error capture. Catches what the console wrapper can't:
// errors that nothing logged, uncaught exceptions and rejected promises with
// no handler.

import { snapshotCrumbs } from './breadcrumbs.js';
import { isSuppressed, post, storeValue } from './messaging.js';

/**
 * Two separate listeners because the browser fires two distinct events with
 * different payload shapes: `error` for synchronous throws (gives us
 * filename/lineno) and `unhandledrejection` for promise rejections (gives us a
 * `reason` that may be anything, not just an Error). Both use capture phase
 * (the `true` 3rd arg) to see events before page handlers can stop them.
 */
export function initErrorListeners(): void {
  window.addEventListener(
    'error',
    (event) => {
      if (isSuppressed()) return;
      // event.error is the thrown value, but it can be missing (e.g. cross-origin
      // script errors are sanitised to a bare message), so fall back to the message
      // string so we still store *something* replayable.
      const message = event.message || 'Unknown error';
      const storeId = storeValue(event.error != null ? [event.error] : [message]);
      const stack = event.error instanceof Error ? (event.error.stack ?? null) : null;
      post({
        kind: 'uncaught',
        level: 'error',
        message,
        filename: event.filename || null,
        lineno: typeof event.lineno === 'number' ? event.lineno : null,
        stack,
        storeId,
        pageUrl: window.location.href,
        breadcrumbs: snapshotCrumbs(),
        timestamp: Date.now(),
      });
    },
    true,
  );

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      if (isSuppressed()) return;
      // A rejection reason is `unknown`: it could be an Error, a string, or any
      // object the code rejected with. Normalise to a message + optional stack.
      const reason: unknown = event.reason;
      const storeId = storeValue(reason != null ? [reason] : ['Unhandled rejection']);
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? (reason.stack ?? null) : null;
      post({
        kind: 'rejection',
        level: 'error',
        message,
        stack,
        storeId,
        pageUrl: window.location.href,
        breadcrumbs: snapshotCrumbs(),
        timestamp: Date.now(),
      });
    },
    true,
  );
}
