// MAIN-world bridge: ships captured events to the overlay over postMessage,
// keeps unclonable console args by id for later replay, and exposes the
// suppress flag the console wrapper reads to avoid re-capturing its own
// replay output.

import { MSG_TYPE, NAV_TYPE, REPLAY_TYPE } from '../shared/protocol.js';

import type {
  InterceptorMessage,
  InterceptorPayload,
  NavMessage,
  ReplayMessage,
} from '../shared/types.js';

const STORE_MAX = 200;

const store = new Map<number, unknown[]>();
let nextId = 0;
let suppressed = false;

/**
 * Stash raw console args by id so the overlay can later ask for the
 * original (unclonable) values. FIFO-evicts the oldest once STORE_MAX
 * is reached.
 */
export function storeValue(value: unknown[]): number {
  const id = nextId++;
  store.set(id, value);
  if (store.size > STORE_MAX) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  return id;
}

/**
 * True while a replay is re-printing to the console; read by the console
 * wrapper to skip capturing its own replay output.
 */
export function isSuppressed(): boolean {
  return suppressed;
}

/**
 * Stamp the Racna type tag and ship the payload to the overlay via
 * window.postMessage. Clone failures are swallowed (see catch) because a
 * capture tool must never throw into the page it's watching.
 */
export function post(payload: InterceptorPayload): void {
  try {
    const message = { type: MSG_TYPE, ...payload } as InterceptorMessage;
    window.postMessage(message, '*');
  } catch {
    /* ignore postMessage failures (cloning errors etc.) */
  }
}

/**
 * Tell the overlay the SPA location changed (via history.pushState/
 * replaceState) so it can honour clear-on-navigation. Sent unconditionally:
 * the overlay owns the setting and decides whether to act. Swallows clone
 * failures like post() for the same reason.
 */
export function postNav(href: string): void {
  try {
    const message = { type: NAV_TYPE, href } as NavMessage;
    window.postMessage(message, '*');
  } catch {
    /* ignore postMessage failures */
  }
}

function isReplayMessage(data: unknown): data is ReplayMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === REPLAY_TYPE &&
    typeof (data as { storeId?: unknown }).storeId === 'number'
  );
}

/**
 * Wire the overlay → interceptor replay channel: on a ReplayMessage,
 * re-invoke the *original* console method (saved before the wrapper was
 * installed) so DevTools expands the live object instead of the cloned
 * skeleton sent over the wire.
 */
export function setupReplayListener(origError: (...args: unknown[]) => void): void {
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!isReplayMessage(event.data)) return;
    const args = store.get(event.data.storeId);
    if (!args) return;
    // Block our own replay call from being re-captured by the console wrapper.
    suppressed = true;
    try {
      origError.apply(console, args);
    } finally {
      suppressed = false;
    }
  });
}
