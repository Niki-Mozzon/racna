import { beforeEach, describe, expect, it } from 'vitest';

import { buildModalText } from '../../src/overlay/rendering/modal-detail.js';
import { DEFAULTS, state } from '../../src/overlay/state.js';
import { BODY_MAX } from '../../src/shared/protocol.js';

import type { Entry } from '../../src/shared/types.js';

function consoleEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 1,
    kind: 'console',
    level: 'error',
    message: 'boom',
    url: null,
    method: null,
    status: null,
    statusText: null,
    filename: null,
    lineno: null,
    stack: 'Error: boom\n    at handler (app.js:10:5)',
    storeId: 0,
    reqHeaders: null,
    reqBody: null,
    resHeaders: null,
    resBody: null,
    duration: undefined,
    pageUrl: 'https://localhost/checkout',
    breadcrumbs: [
      { type: 'click', message: 'BUTTON "Save"', timestamp: 1_000 },
      { type: 'http', message: 'GET /api/user 200', timestamp: 2_000 },
    ],
    firstSeen: 5_000,
    timestamp: 5_000,
    count: 1,
    ...overrides,
  };
}

function networkEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 2,
    kind: 'network',
    level: 'error',
    message: 'POST https://localhost/api/pay 500',
    url: 'https://localhost/api/pay',
    method: 'POST',
    status: 500,
    statusText: 'Server Error',
    filename: null,
    lineno: null,
    stack: 'Error\n    at pay (checkout.js:42:3)',
    storeId: null,
    reqHeaders: {
      Authorization: 'Bearer s3cr3t-token',
      'Content-Type': 'application/json',
    },
    reqBody: '{"amount":100}',
    resHeaders: {
      'set-cookie': 'sid=abc123',
      'content-length': '17',
    },
    resBody: '{"error":"oops"}',
    duration: 123,
    pageUrl: 'https://localhost/checkout',
    breadcrumbs: [],
    firstSeen: 5_000,
    timestamp: 5_000,
    count: 1,
    ...overrides,
  };
}

beforeEach(() => {
  state.settings = { ...DEFAULTS, copyFields: { ...DEFAULTS.copyFields } };
});

describe('buildModalText, plain format', () => {
  it('orders page first and the error block last', () => {
    const out = buildModalText(consoleEntry());
    expect(out.startsWith('PAGE: https://localhost/checkout')).toBe(true);
    expect(out.indexOf('MESSAGE: boom')).toBeGreaterThan(out.indexOf('BREADCRUMBS:'));
  });

  it('contains no fences and no instruction text', () => {
    const out = buildModalText(consoleEntry());
    expect(out).not.toContain('```');
    expect(out).not.toContain('root cause');
  });

  it('keeps credential header values verbatim', () => {
    const out = buildModalText(networkEntry());
    expect(out).toContain('Authorization: Bearer s3cr3t-token');
    expect(out).toContain('set-cookie: sid=abc123');
  });

  it('omits fields whose copy toggle is off', () => {
    state.settings.copyFields.breadcrumbs = false;
    state.settings.copyFields.stack = false;
    const out = buildModalText(consoleEntry());
    expect(out).not.toContain('BREADCRUMBS:');
    expect(out).not.toContain('STACK:');
  });

  it('adds a SEEN line only for deduplicated entries', () => {
    expect(buildModalText(consoleEntry())).not.toContain('SEEN:');
    const out = buildModalText(consoleEntry({ count: 3, firstSeen: 1_000 }));
    expect(out).toContain('SEEN: First ');
    expect(out).toContain(', Last ');
  });
});

describe('buildModalText, AI format', () => {
  beforeEach(() => {
    state.settings.aiFormat = true;
  });

  it('leads with the error and ends with the page', () => {
    const out = buildModalText(consoleEntry());
    expect(out.startsWith('MESSAGE: boom')).toBe(true);
    expect(out.trimEnd().endsWith('PAGE: https://localhost/checkout')).toBe(true);
  });

  it('renders breadcrumbs as a fenced timeline ending at the failure', () => {
    const out = buildModalText(consoleEntry());
    expect(out).toContain('TIMELINE (oldest first, ends at this failure):');
    expect(out).toContain('FAIL   this entry (see above)');
    expect(out).toContain('```');
  });

  it('redacts credential headers case-insensitively, keeps the rest', () => {
    const out = buildModalText(networkEntry());
    expect(out).toContain('Authorization: [redacted]');
    expect(out).toContain('set-cookie: [redacted]');
    expect(out).not.toContain('s3cr3t-token');
    expect(out).not.toContain('sid=abc123');
    expect(out).toContain('Content-Type: application/json');
    expect(out).toContain('content-length: 17');
  });

  it('marks bodies that hit the capture cap', () => {
    const capped = networkEntry({ resBody: 'x'.repeat(BODY_MAX) });
    expect(buildModalText(capped)).toContain(
      '[body truncated at ' + String(BODY_MAX) + ' characters]',
    );
    expect(buildModalText(networkEntry())).not.toContain('[body truncated');
  });

  it('lengthens the fence when a payload already contains one', () => {
    const tricky = networkEntry({ resBody: 'before\n```\ninjected\n```\nafter' });
    expect(buildModalText(tricky)).toContain('````');
  });

  it('adds no instruction or prompt text', () => {
    const out = buildModalText(networkEntry());
    expect(out).not.toContain('root cause');
    expect(out).not.toContain('Help diagnose');
  });

  it('still honours the per-field toggles', () => {
    state.settings.copyFields.responseBody = false;
    state.settings.copyFields.requestHeaders = false;
    const out = buildModalText(networkEntry());
    expect(out).not.toContain('RESPONSE BODY:');
    expect(out).not.toContain('REQUEST HEADERS:');
    expect(out).toContain('REQUEST: POST https://localhost/api/pay');
  });
});
