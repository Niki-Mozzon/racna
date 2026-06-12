// MAIN-world network capture. Monkey-patches both XMLHttpRequest and fetch so
// we can observe every request the page makes and post the failed ones
// (status 0, or >= 400) to the overlay, plus drop an HTTP breadcrumb for *all*
// of them. Patched at document_start so the page's own code calls our wrappers,
// not the originals. Everything here is wrapped defensively: a capture tool
// must never break the page's networking.

import { BODY_MAX } from '../shared/protocol.js';

import { addCrumb, snapshotCrumbs } from './breadcrumbs.js';
import { post } from './messaging.js';

import type { Headers as MsgHeaders } from '../shared/types.js';

/** Parse the raw `\r\n`-delimited string from XHR.getAllResponseHeaders()
 *  into an object. Returns null when there's nothing usable. */

function parseRawHeaders(raw: string | null): MsgHeaders {
  if (!raw) return null;
  const result: Record<string, string> = {};
  for (const line of raw.trim().split('\r\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

/** Normalise a fetch headers value (a `Headers` instance, a plain object, or
 *  an array of pairs) into a flat object. */
function headersToObj(headers: unknown): MsgHeaders {
  if (headers == null) return null;
  const result: Record<string, string> = {};
  try {
    if (headers instanceof Headers) {
      headers.forEach((v, k) => {
        result[k] = v;
      });
    } else if (typeof headers === 'object') {
      Object.assign(result, headers);
    }
  } catch {
    /* ignore */
  }
  return Object.keys(result).length > 0 ? result : null;
}

/** Only string request bodies are kept (truncated); anything binary/streamed
 *  is recorded as a marker rather than serialised. */
function truncateBody(body: unknown): string | null {
  if (body == null || body === '') return null;
  if (typeof body === 'string') return body.slice(0, BODY_MAX);
  return '[non-text body]';
}

// XHR has no single call that sees the whole request/response, so we stash the
// pieces we learn at open()/setRequestHeader()/send() directly on the XHR
// instance under `_en_*` keys, then read them back in the `loadend` handler.
// Per-instance storage (vs a WeakMap) keeps each request's data with the
// object it belongs to and is naturally GC'd with it. The `_en_` prefix avoids
// colliding with real XHR properties.
interface XhrAnnotations {
  _en_method?: string;
  _en_url?: string;
  _en_reqHeaders?: Record<string, string>;
  _en_reqBody?: string | null;
  _en_stack?: string | null;
  _en_pageUrl?: string;
  _en_t0?: number; // performance.now() at send(), for the duration calc.
}

type AnnotatedXhr = XMLHttpRequest & XhrAnnotations;

/** Wrap XMLHttpRequest.prototype to record request metadata and report
 *  failures on completion. */
function patchXhr(): void {
  // We capture the originals to re-invoke them. eslint flags "unbound method"
  // because we hold the prototype functions detached, but that's exactly the
  // point: we call them later with an explicit `this` via .call().
  /* eslint-disable @typescript-eslint/unbound-method -- intentional unbound prototype refs for re-invocation */
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  /* eslint-enable @typescript-eslint/unbound-method */

  XMLHttpRequest.prototype.open = function (
    this: AnnotatedXhr,
    method: string,
    url: string | URL,
    ...rest: [async?: boolean, username?: string | null, password?: string | null]
  ): void {
    this._en_method = method.toUpperCase();
    this._en_url = typeof url === 'string' ? url : url.href;
    this._en_reqHeaders = {};
    const openFn = origOpen as (...args: unknown[]) => void;
    openFn.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (
    this: AnnotatedXhr,
    name: string,
    value: string,
  ): void {
    this._en_reqHeaders ??= {};
    this._en_reqHeaders[name] = value;
    origSetHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function (
    this: AnnotatedXhr,
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    // Capture the call site now, at send(), since the loadend handler runs later
    // with a useless internal stack, so we snapshot the originating stack here.
    this._en_stack = new Error().stack ?? null;
    this._en_pageUrl = window.location.href;
    this._en_reqBody = truncateBody(body);

    // 'loadend' fires on success, error, abort, and timeout alike. It is the one
    // event guaranteed to run once the request settles, whatever the outcome.
    this.addEventListener('loadend', () => {
      const t0 = this._en_t0 ?? performance.now();
      const duration = Math.round(performance.now() - t0);
      const method = this._en_method ?? 'GET';
      const url = this._en_url ?? '';
      addCrumb({
        type: 'http',
        message: `${method} ${url} → ${String(this.status)} (${String(duration)} ms)`,
        timestamp: Date.now(),
      });
      // Only report failures. status 0 means the request never completed
      // (network down, CORS block, aborted); >= 400 is an HTTP error.
      if (this.status === 0 || this.status >= 400) {
        let resBody: string | null = null;
        try {
          // Reading .responseText throws unless responseType is '' or 'text';
          // for blob/arraybuffer/json responses we simply skip the body.
          if (!this.responseType || this.responseType === 'text') {
            resBody = this.responseText ? this.responseText.slice(0, BODY_MAX) : null;
          }
        } catch {
          /* responseText may throw on some response types */
        }
        const reqHeaders = this._en_reqHeaders;
        post({
          kind: 'network',
          method,
          url,
          status: this.status,
          statusText: this.status === 0 ? 'Network Error' : this.statusText || '',
          reqHeaders: reqHeaders && Object.keys(reqHeaders).length > 0 ? reqHeaders : null,
          reqBody: this._en_reqBody ?? null,
          resHeaders: parseRawHeaders(this.getAllResponseHeaders()),
          resBody,
          stack: this._en_stack ?? null,
          pageUrl: this._en_pageUrl ?? window.location.href,
          breadcrumbs: snapshotCrumbs(),
          timestamp: Date.now(),
          duration,
        });
      }
    });

    // Start the clock immediately before handing off to the real send().
    this._en_t0 = performance.now();
    const sendFn = origSend as (...args: unknown[]) => void;
    // Preserve the no-arg vs arg call shape, as passing an explicit `undefined`
    // is not identical to calling send() with no arguments for all engines.
    if (body === undefined) sendFn.call(this);
    else sendFn.call(this, body);
  };
}

/** Wrap window.fetch to record request metadata and report non-OK / failed
 *  responses, while always returning the untouched response/rejection to the
 *  caller. */
function patchFetch(): void {
  if (typeof window.fetch !== 'function') return;
  const origFetch = window.fetch.bind(window);

  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url: string;
    let method: string;
    try {
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.href;
      } else {
        url = input.url;
      }
      const rawMethod =
        init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET');
      method = rawMethod.toUpperCase();
    } catch {
      url = '';
      method = 'GET';
    }

    let reqHeaders: MsgHeaders = null;
    try {
      const raw =
        init?.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : null);
      reqHeaders = headersToObj(raw);
    } catch {
      reqHeaders = null;
    }

    let reqBody: string | null = null;
    try {
      const raw = init?.body ?? null;
      reqBody = truncateBody(raw);
    } catch {
      reqBody = null;
    }

    // Snapshot call site + start time before awaiting, same reasoning as XHR.
    const callStack = new Error().stack ?? null;
    const pageUrl = window.location.href;
    const t0 = performance.now();

    // Two-arm .then(): the first handles a resolved response (which may still
    // be an HTTP error), the second a thrown/rejected fetch (network failure).
    return origFetch(input, init).then(
      (response) => {
        const duration = Math.round(performance.now() - t0);
        addCrumb({
          type: 'http',
          message: `${method} ${url} → ${String(response.status)} (${String(duration)} ms)`,
          timestamp: Date.now(),
        });
        if (!response.ok) {
          const resHeaders = headersToObj(response.headers);
          const ts = Date.now();
          const crumbsSnap = snapshotCrumbs();
          // Must .clone() before reading the body: a Response body is a
          // one-shot stream, so consuming the original would leave the page's
          // own `.json()`/`.text()` call with an already-used body. We read the
          // clone; the page keeps the pristine original.
          response
            .clone()
            .text()
            .then(
              (body) => {
                post({
                  kind: 'network',
                  method,
                  url,
                  status: response.status,
                  statusText: response.statusText || '',
                  reqHeaders,
                  reqBody,
                  resHeaders,
                  resBody: body ? body.slice(0, BODY_MAX) : null,
                  stack: callStack,
                  pageUrl,
                  breadcrumbs: crumbsSnap,
                  timestamp: ts,
                  duration,
                });
              },
              () => {
                // Body read failed (e.g. already consumed elsewhere); still
                // report the failure, just without a response body.
                post({
                  kind: 'network',
                  method,
                  url,
                  status: response.status,
                  statusText: response.statusText || '',
                  reqHeaders,
                  reqBody,
                  resHeaders,
                  resBody: null,
                  stack: callStack,
                  pageUrl,
                  breadcrumbs: crumbsSnap,
                  timestamp: ts,
                  duration,
                });
              },
            );
        }
        return response; // hand the original response back to the page untouched
      },
      // Rejection arm: the fetch itself failed (DNS, offline, CORS preflight).
      // Report it as a status-0 entry, then re-throw so the page's own
      // .catch() still fires exactly as it would have.
      (err: unknown) => {
        const duration = Math.round(performance.now() - t0);
        addCrumb({
          type: 'http',
          message: `${method} ${url} → 0 (${String(duration)} ms)`,
          timestamp: Date.now(),
        });
        post({
          kind: 'network',
          method,
          url,
          status: 0,
          statusText: err instanceof Error ? err.message : 'Network Error',
          reqHeaders,
          reqBody,
          resHeaders: null,
          resBody: null,
          stack: callStack,
          pageUrl,
          breadcrumbs: snapshotCrumbs(),
          timestamp: Date.now(),
          duration,
        });
        throw err;
      },
    );
  };
}

/** Install both network patches. Called once from index.ts at startup. */
export function initNetwork(): void {
  patchXhr();
  patchFetch();
}
