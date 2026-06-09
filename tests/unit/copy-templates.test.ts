import { beforeEach, describe, expect, it } from 'vitest';

import { relevantFieldsForEntry, templateFieldsDiffer } from '../../src/overlay/copy-templates.js';
import { DEFAULTS, state } from '../../src/overlay/state.js';

import type { CopyTemplate, Entry } from '../../src/shared/types.js';

function makeEntry(overrides: Partial<Entry>): Entry {
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

beforeEach(() => {
  state.settings = { ...DEFAULTS, copyFields: { ...DEFAULTS.copyFields } };
  state.activeCopyTemplateId = null;
  state.currentModalEntry = null;
});

describe('relevantFieldsForEntry', () => {
  it('returns all default keys when entry is null', () => {
    const result = relevantFieldsForEntry(null);
    expect(result.length).toBe(Object.keys(DEFAULTS.copyFields).length);
  });

  it('returns network-specific fields for a network entry', () => {
    const result = relevantFieldsForEntry(makeEntry({ kind: 'network' }));
    expect(result).toContain('request');
    expect(result).toContain('requestHeaders');
    expect(result).toContain('responseBody');
    expect(result).toContain('callStack');
    expect(result).not.toContain('message');
    expect(result).not.toContain('stack');
    expect(result).not.toContain('location');
  });

  it('returns console-specific fields for console-like entries', () => {
    const result = relevantFieldsForEntry(makeEntry({ kind: 'console' }));
    expect(result).toContain('message');
    expect(result).toContain('stack');
    expect(result).toContain('location');
    expect(result).not.toContain('request');
    expect(result).not.toContain('responseBody');
  });

  it('always includes common fields (pageUrl, userAgent, seen, breadcrumbs)', () => {
    for (const kind of ['network', 'console', 'uncaught', 'rejection'] as const) {
      const result = relevantFieldsForEntry(makeEntry({ kind }));
      expect(result).toContain('pageUrl');
      expect(result).toContain('userAgent');
      expect(result).toContain('seen');
      expect(result).toContain('breadcrumbs');
    }
  });
});

describe('templateFieldsDiffer', () => {
  const tpl: CopyTemplate = {
    id: 'custom:1',
    name: 'Test',
    fields: { message: 1, stack: 1 },
  };

  it('returns false when fields match the template exactly', () => {
    expect(
      templateFieldsDiffer(tpl, { message: true, stack: true, pageUrl: false, userAgent: false }),
    ).toBe(false);
  });

  it('returns true when an enabled field is missing from the template', () => {
    expect(templateFieldsDiffer(tpl, { message: true, stack: true, pageUrl: true })).toBe(true);
  });

  it('returns true when the template has a field the user disabled', () => {
    expect(templateFieldsDiffer(tpl, { message: false, stack: true })).toBe(true);
  });

  it('treats unset as falsy on both sides', () => {
    expect(templateFieldsDiffer({ ...tpl, fields: {} }, {})).toBe(false);
  });
});
