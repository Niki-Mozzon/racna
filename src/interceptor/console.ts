// MAIN-world console wrapper. Replaces the five console methods with versions
// that still call through to the real console but also feed Racna: error/warn
// become captured entries (shipped to the overlay), while log/info/debug only
// leave breadcrumbs. Installed at document_start so the page can never see the
// originals.

import { addCrumb, snapshotCrumbs } from './breadcrumbs.js';
import { isSuppressed, post, storeValue } from './messaging.js';

type AnyConsoleFn = (...args: unknown[]) => void;

// Grab the originals *before* we overwrite anything. `.bind(console)` freezes
// the real implementations so replay (and our own pass-through) can never hit
// the wrapped versions and recurse. These references are the only way back to
// the genuine console for the lifetime of the page.
const origError: AnyConsoleFn = console.error.bind(console);
const origWarn: AnyConsoleFn = console.warn.bind(console);
const origLog: AnyConsoleFn = console.log.bind(console);
const origInfo: AnyConsoleFn = console.info.bind(console);
const origDebug: AnyConsoleFn = console.debug.bind(console);

/** The untouched console.error, handed to the replay listener so it can
 *  re-print live objects without re-triggering capture. */
export function getOrigError(): AnyConsoleFn {
  return origError;
}

/** Flatten arbitrary console args into one display string. Best-effort and
 *  defensive: anything that throws while stringifying (circular JSON, exotic
 *  getters) degrades to a placeholder rather than breaking the page's log. */
function serialize(args: unknown[]): string {
  return args
    .map((a) => {
      try {
        if (a instanceof Error) return a.message;
        if (a === null) return 'null';
        if (a === undefined) return 'undefined';
        if (typeof a === 'object') return JSON.stringify(a);
        if (typeof a === 'symbol') return a.toString();
        if (typeof a === 'function') return a.toString();
        // eslint-disable-next-line @typescript-eslint/no-base-to-string -- a is narrowed to bigint | boolean | number | string here
        return String(a);
      } catch {
        return '[unserializable]';
      }
    })
    .join(' ');
}

/**
 * Wrapper for error/warn: pass through to the real console, then capture.
 * "Capture" means both a breadcrumb *and* a full message posted to the overlay,
 * plus stashing the raw args by id (storeValue) so the user can later replay
 * the live objects in DevTools.
 *
 * The `isSuppressed()` gate skips capture while a replay is re-printing, so
 * replaying an error doesn't capture it a second time. We always call the
 * original first (wrapped in try/catch) so a Racna bug can never swallow the
 * page's own logging.
 */
function wrapCaptureLevel(level: 'error' | 'warn', original: AnyConsoleFn): AnyConsoleFn {
  return function (...args: unknown[]) {
    try {
      original.apply(console, args);
    } catch {
      /* ignore */
    }
    if (isSuppressed()) return;
    addCrumb({
      type: 'log',
      level,
      message: serialize(args).slice(0, 120), // breadcrumbs stay short on purpose
      timestamp: Date.now(),
    });
    const storeId = storeValue(args);
    post({
      kind: 'console',
      level,
      message: serialize(args),
      stack: new Error().stack ?? null,
      storeId,
      pageUrl: window.location.href,
      breadcrumbs: snapshotCrumbs(),
      timestamp: Date.now(),
    });
  };
}

/**
 * Wrapper for log/info/debug: pass through, then record a breadcrumb only.
 * These levels are never captured as entries. They exist purely as context
 * for whatever error/network event comes next.
 */
function wrapCrumbLevel(level: 'log' | 'info' | 'debug', original: AnyConsoleFn): AnyConsoleFn {
  // the new console function
  return function (...args: unknown[]) {
    try {
      // log anyway
      original.apply(console, args);
    } catch {
      /* ignore */
    }
    if (isSuppressed()) return;
    addCrumb({
      type: 'log',
      level,
      message: serialize(args).slice(0, 120),
      timestamp: Date.now(),
    });
  };
}

export function installConsoleWrappers(): void {
  console.error = wrapCaptureLevel('error', origError);
  console.warn = wrapCaptureLevel('warn', origWarn);
  console.log = wrapCrumbLevel('log', origLog);
  console.info = wrapCrumbLevel('info', origInfo);
  console.debug = wrapCrumbLevel('debug', origDebug);
}
