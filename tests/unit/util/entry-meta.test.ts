import { describe, expect, it } from 'vitest';

import {
  entryClass,
  entryIcon,
  entryTooltip,
  hasExpandableDetail,
} from '../../../src/overlay/util.js';

import type { Entry } from '../../../src/shared/types.js';

function baseEntry(overrides: Partial<Entry>): Entry {
  return {
    id: 1,
    kind: 'console',
    level: 'error',
    message: '',
    url: null,
    method: null,
    status: null,
    statusText: null,
    filename: null,
    lineno: null,
    stack: null,
    storeId: null,
    reqHeaders: null,
    reqBody: null,
    resHeaders: null,
    resBody: null,
    duration: undefined,
    pageUrl: null,
    breadcrumbs: null,
    firstSeen: 0,
    timestamp: 0,
    count: 1,
    ...overrides,
  };
}

describe('entryClass', () => {
  it('returns "net" for network entries', () => {
    expect(entryClass(baseEntry({ kind: 'network' }))).toBe('net');
  });

  it('returns "warn" for warning level', () => {
    expect(entryClass(baseEntry({ kind: 'console', level: 'warn' }))).toBe('warn');
  });

  it('returns "rej" for unhandled rejections', () => {
    expect(entryClass(baseEntry({ kind: 'rejection' }))).toBe('rej');
  });

  it('returns "err" by default', () => {
    expect(entryClass(baseEntry({ kind: 'console', level: 'error' }))).toBe('err');
    expect(entryClass(baseEntry({ kind: 'uncaught', level: 'error' }))).toBe('err');
  });
});

describe('entryIcon', () => {
  it('returns an inline svg for every kind', () => {
    expect(entryIcon(baseEntry({ kind: 'network' }))).toContain('<svg');
    expect(entryIcon(baseEntry({ kind: 'console', level: 'error' }))).toContain('<svg');
  });

  it('gives console-error, uncaught, and rejection distinct icons', () => {
    const consoleErr = entryIcon(baseEntry({ kind: 'console', level: 'error' }));
    const uncaught = entryIcon(baseEntry({ kind: 'uncaught', level: 'error' }));
    const rejection = entryIcon(baseEntry({ kind: 'rejection' }));
    expect(new Set([consoleErr, uncaught, rejection]).size).toBe(3);
  });

  it('distinguishes warnings from errors', () => {
    expect(entryIcon(baseEntry({ kind: 'console', level: 'warn' }))).not.toBe(
      entryIcon(baseEntry({ kind: 'console', level: 'error' })),
    );
  });

  it('gives network its own icon', () => {
    expect(entryIcon(baseEntry({ kind: 'network' }))).not.toBe(
      entryIcon(baseEntry({ kind: 'console', level: 'error' })),
    );
  });
});

describe('entryTooltip', () => {
  it('labels uncaught errors and rejections distinctly', () => {
    expect(entryTooltip(baseEntry({ kind: 'uncaught' }))).toBe('Uncaught error');
    expect(entryTooltip(baseEntry({ kind: 'rejection' }))).toBe('Unhandled promise rejection');
  });

  it('labels console warnings vs errors', () => {
    expect(entryTooltip(baseEntry({ kind: 'console', level: 'warn' }))).toBe('Console warning');
    expect(entryTooltip(baseEntry({ kind: 'console', level: 'error' }))).toBe('Console error');
  });
});

describe('hasExpandableDetail', () => {
  it('always true for network entries', () => {
    expect(hasExpandableDetail(baseEntry({ kind: 'network' }))).toBe(true);
  });

  it('true when there is a stack', () => {
    expect(hasExpandableDetail(baseEntry({ stack: 'Error: at ...' }))).toBe(true);
  });

  it('true when there is a filename', () => {
    expect(hasExpandableDetail(baseEntry({ filename: 'app.js' }))).toBe(true);
  });

  it('true when there is a message', () => {
    expect(hasExpandableDetail(baseEntry({ message: 'something broke' }))).toBe(true);
  });

  it('false when everything is empty', () => {
    expect(hasExpandableDetail(baseEntry({}))).toBe(false);
  });
});
