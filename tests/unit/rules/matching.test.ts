import { beforeEach, describe, expect, it } from 'vitest';

import {
  findWatchRule,
  matchesIgnoreRule,
  matchesWatchRule,
  withinCooldown,
} from '../../../src/overlay/rules/matching.js';
import { DEFAULTS, state } from '../../../src/overlay/state.js';

import type { Entry, Rule } from '../../../src/shared/types.js';

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
  state.settings = { ...DEFAULTS };
  state.ignoreRules = [];
  state.watchRules = [];
  state.watchToastTimes = {};
});

describe('matchesIgnoreRule (network)', () => {
  it('matches by glob pattern + status code', () => {
    const rule: Rule = {
      id: 'r1',
      kind: 'network',
      pattern: '/api/*',
      status: 500,
      createdAt: 0,
    };
    state.ignoreRules = [rule];
    expect(
      matchesIgnoreRule(
        makeEntry({ kind: 'network', url: 'https://x.test/api/users', status: 500 }),
      ),
    ).toBe(true);
    expect(
      matchesIgnoreRule(
        makeEntry({ kind: 'network', url: 'https://x.test/api/users', status: 404 }),
      ),
    ).toBe(false);
    expect(
      matchesIgnoreRule(makeEntry({ kind: 'network', url: 'https://x.test/other', status: 500 })),
    ).toBe(false);
  });

  it('matches by legacy urlPath field when pattern is absent', () => {
    const rule: Rule = {
      id: 'r2',
      kind: 'network',
      urlPath: '/legacy',
      status: 404,
      createdAt: 0,
    };
    state.ignoreRules = [rule];
    expect(
      matchesIgnoreRule(makeEntry({ kind: 'network', url: 'https://x.test/legacy', status: 404 })),
    ).toBe(true);
    expect(
      matchesIgnoreRule(makeEntry({ kind: 'network', url: 'https://x.test/legacy', status: 500 })),
    ).toBe(false);
  });

  it('does not match a console entry against a network rule', () => {
    state.ignoreRules = [{ id: 'r3', kind: 'network', pattern: '/*', status: 500, createdAt: 0 }];
    expect(matchesIgnoreRule(makeEntry({ kind: 'console', message: 'boom' }))).toBe(false);
  });
});

describe('matchesIgnoreRule (console-family)', () => {
  it('matches all console-like kinds (console, uncaught, rejection)', () => {
    state.ignoreRules = [{ id: 'r', kind: 'console', pattern: '*boom*', createdAt: 0 }];
    expect(matchesIgnoreRule(makeEntry({ kind: 'console', message: 'kaboom' }))).toBe(true);
    expect(matchesIgnoreRule(makeEntry({ kind: 'uncaught', message: 'kaboom' }))).toBe(true);
    expect(matchesIgnoreRule(makeEntry({ kind: 'rejection', message: 'kaboom' }))).toBe(true);
  });

  it('matches by legacy messageContains substring (case-insensitive)', () => {
    state.ignoreRules = [{ id: 'r', kind: 'console', messageContains: 'timeout', createdAt: 0 }];
    expect(
      matchesIgnoreRule(makeEntry({ kind: 'console', message: 'Request TIMEOUT after 5s' })),
    ).toBe(true);
    expect(matchesIgnoreRule(makeEntry({ kind: 'console', message: 'something else' }))).toBe(
      false,
    );
  });

  it('does not match a network entry against a console rule', () => {
    state.ignoreRules = [{ id: 'r', kind: 'console', pattern: '*', createdAt: 0 }];
    expect(matchesIgnoreRule(makeEntry({ kind: 'network', url: '/x', status: 500 }))).toBe(false);
  });
});

describe('findWatchRule / matchesWatchRule', () => {
  it('returns the matching rule', () => {
    const rule: Rule = { id: 'w1', kind: 'network', pattern: '/auth/*', status: 401, createdAt: 0 };
    state.watchRules = [rule];
    expect(findWatchRule(makeEntry({ kind: 'network', url: '/auth/login', status: 401 }))).toBe(
      rule,
    );
    expect(matchesWatchRule(makeEntry({ kind: 'network', url: '/auth/login', status: 401 }))).toBe(
      true,
    );
  });

  it('returns null when no rule matches', () => {
    state.watchRules = [{ id: 'w', kind: 'network', pattern: '/x', status: 500, createdAt: 0 }];
    expect(findWatchRule(makeEntry({ kind: 'network', url: '/y', status: 500 }))).toBe(null);
    expect(matchesWatchRule(makeEntry({ kind: 'network', url: '/y', status: 500 }))).toBe(false);
  });
});

describe('withinCooldown', () => {
  const rule: Rule = { id: 'r', kind: 'console', pattern: '*', createdAt: 0 };

  it('returns false when watchCooldownSecs is 0', () => {
    state.settings.watchCooldownSecs = 0;
    state.watchToastTimes.r = Date.now();
    expect(withinCooldown(rule)).toBe(false);
  });

  it('returns true within the cooldown window', () => {
    state.settings.watchCooldownSecs = 30;
    state.watchToastTimes.r = Date.now() - 10_000; // 10s ago
    expect(withinCooldown(rule)).toBe(true);
  });

  it('returns false after the cooldown window', () => {
    state.settings.watchCooldownSecs = 30;
    state.watchToastTimes.r = Date.now() - 31_000;
    expect(withinCooldown(rule)).toBe(false);
  });

  it('returns false when no toast time is recorded', () => {
    state.settings.watchCooldownSecs = 30;
    expect(withinCooldown(rule)).toBe(false);
  });
});
