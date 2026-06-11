import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FLOOD_RATE } from '../../src/overlay/constants.js';
import { addEntry, shouldCapture } from '../../src/overlay/entries.js';
import { resetFloodState, resumeCapture } from '../../src/overlay/rendering/flood-banner.js';
import { DEFAULTS, state } from '../../src/overlay/state.js';

import type { InterceptorPayload } from '../../src/shared/types.js';

function consoleMsg(overrides: Partial<InterceptorPayload> = {}): InterceptorPayload {
  return {
    kind: 'console',
    level: 'error',
    message: 'boom',
    stack: null,
    storeId: 0,
    pageUrl: 'https://localhost/test',
    breadcrumbs: [],
    timestamp: Date.now(),
    ...overrides,
  } as InterceptorPayload;
}

function networkMsg(overrides: Partial<InterceptorPayload> = {}): InterceptorPayload {
  return {
    kind: 'network',
    method: 'GET',
    url: 'https://localhost/api',
    status: 500,
    statusText: '',
    reqHeaders: null,
    reqBody: null,
    resHeaders: null,
    resBody: null,
    stack: null,
    duration: 100,
    pageUrl: 'https://localhost/test',
    breadcrumbs: [],
    timestamp: Date.now(),
    ...overrides,
  } as InterceptorPayload;
}

beforeEach(() => {
  state.settings = { ...DEFAULTS, copyFields: { ...DEFAULTS.copyFields } };
  state.ignoreRules = [];
  state.watchRules = [];
  state.entries = [];
  state.enabledSites = ['localhost', '127.0.0.1'];
  state.nextId = 0;
  state.hasUnseen = false;
  state.isExpanded = false;
  state.domReady = false; // skip render() calls in tests
  state.watchToastTimes = {};
  state.capDropped = 0;
  resetFloodState(); // clear paused/dropped + the module-level rate window
});

describe('shouldCapture', () => {
  it('returns false when disabled in settings', () => {
    state.settings.enabled = false;
    expect(shouldCapture(consoleMsg())).toBe(false);
  });

  it('returns false when current host is not in enabledSites', () => {
    state.enabledSites = ['other.test'];
    expect(shouldCapture(consoleMsg())).toBe(false);
  });

  it('returns false for console warnings when warnings disabled', () => {
    state.settings.showConsoleWarns = false;
    expect(shouldCapture(consoleMsg({ level: 'warn' }))).toBe(false);
  });

  it('returns true for console errors by default', () => {
    expect(shouldCapture(consoleMsg())).toBe(true);
  });

  it('returns false for network entries when network capture is off', () => {
    state.settings.showNetwork = false;
    expect(shouldCapture(networkMsg())).toBe(false);
  });

  it('filters network entries by minimum status when configured', () => {
    state.settings.networkMinStatus = 500;
    expect(shouldCapture(networkMsg({ status: 404 }))).toBe(false);
    expect(shouldCapture(networkMsg({ status: 500 }))).toBe(true);
    expect(shouldCapture(networkMsg({ status: 0 }))).toBe(true);
  });

  it('gates network failures by their own toggle', () => {
    state.settings.networkMinStatus = 500;
    state.settings.showNetworkFailures = false;
    expect(shouldCapture(networkMsg({ status: 0 }))).toBe(false);
  });
});

describe('addEntry', () => {
  it('appends a new entry with auto-incremented id', () => {
    addEntry(consoleMsg({ message: 'first' }));
    addEntry(consoleMsg({ message: 'second', timestamp: Date.now() + 1000 }));
    expect(state.entries.length).toBe(2);
    expect(state.entries[0]?.id).toBe(0);
    expect(state.entries[1]?.id).toBe(1);
    expect(state.entries[0]?.message).toBe('first');
  });

  it('dedups identical consecutive messages within DEDUP_MS', () => {
    const ts = Date.now();
    addEntry(consoleMsg({ message: 'same', timestamp: ts }));
    addEntry(consoleMsg({ message: 'same', timestamp: ts + 100 }));
    expect(state.entries.length).toBe(1);
    expect(state.entries[0]?.count).toBe(2);
    expect(state.entries[0]?.timestamp).toBe(ts + 100);
  });

  it('creates a new entry when the dedup window has passed', () => {
    const ts = Date.now();
    addEntry(consoleMsg({ message: 'same', timestamp: ts }));
    addEntry(consoleMsg({ message: 'same', timestamp: ts + 1000 }));
    expect(state.entries.length).toBe(2);
  });

  it('skips entries that match an ignore rule', () => {
    state.ignoreRules = [{ id: 'r', kind: 'console', pattern: '*ignored*', createdAt: 0 }];
    addEntry(consoleMsg({ message: 'this is ignored stuff' }));
    expect(state.entries.length).toBe(0);
  });

  it('still captures watched entries even if they would otherwise be ignored', () => {
    state.ignoreRules = [{ id: 'i', kind: 'console', pattern: '*boom*', createdAt: 0 }];
    state.watchRules = [{ id: 'w', kind: 'console', pattern: '*boom*', createdAt: 0 }];
    addEntry(consoleMsg({ message: 'kaboom!' }));
    expect(state.entries.length).toBe(1);
  });

  it('suppresses watched entries during cooldown', () => {
    state.settings.watchCooldownSecs = 30;
    state.watchRules = [{ id: 'w', kind: 'console', pattern: '*', createdAt: 0 }];
    state.watchToastTimes.w = Date.now() - 5000; // 5s ago, within cooldown
    addEntry(consoleMsg({ message: 'caught' }));
    expect(state.entries.length).toBe(0);
  });

  it('stops storing at maxEntries, keeping the earliest', () => {
    state.settings.maxEntries = 3;
    for (let i = 0; i < 5; i++) {
      addEntry(consoleMsg({ message: 'm' + String(i), timestamp: Date.now() + i * 1000 }));
    }
    // The first 3 are kept; the overflow is dropped rather than evicting older
    // entries, so nothing already captured is lost. No flood pause involved.
    expect(state.entries.length).toBe(3);
    expect(state.entries[0]?.message).toBe('m0');
    expect(state.entries[2]?.message).toBe('m2');
    expect(state.floodPaused).toBe(false);
    expect(state.capDropped).toBe(2); // m3, m4 dropped past the cap
  });

  it('captures again after Clear drops below the cap', () => {
    state.settings.maxEntries = 3;
    for (let i = 0; i < 5; i++) {
      addEntry(consoleMsg({ message: 'm' + String(i), timestamp: Date.now() + i * 1000 }));
    }
    expect(state.entries.length).toBe(3);

    state.entries = []; // what the Clear button does
    addEntry(consoleMsg({ message: 'fresh', timestamp: Date.now() + 99_000 }));
    expect(state.entries.length).toBe(1);
    expect(state.entries[0]?.message).toBe('fresh');
  });

  it('sets hasUnseen when panel is collapsed', () => {
    state.isExpanded = false;
    addEntry(consoleMsg());
    expect(state.hasUnseen).toBe(true);
  });

  it('does not set hasUnseen when panel is expanded', () => {
    state.isExpanded = true;
    addEntry(consoleMsg());
    expect(state.hasUnseen).toBe(false);
  });

  it('maps a network payload onto a network entry', () => {
    addEntry(networkMsg({ url: 'https://x.test/a', status: 503, duration: 250 }));
    const e = state.entries[0];
    expect(e?.kind).toBe('network');
    expect(e?.url).toBe('https://x.test/a');
    expect(e?.status).toBe(503);
    expect(e?.duration).toBe(250);
  });

  it('uses vi mocked timers for cooldown precision', () => {
    vi.useFakeTimers();
    try {
      const base = new Date('2026-01-01T00:00:00Z').getTime();
      vi.setSystemTime(base);
      state.settings.watchCooldownSecs = 10;
      state.watchRules = [{ id: 'w', kind: 'console', pattern: '*', createdAt: 0 }];

      addEntry(consoleMsg({ message: 'one', timestamp: base }));
      expect(state.entries.length).toBe(1);

      // 5s later: still within cooldown, would-be-watched is dropped
      vi.setSystemTime(base + 5000);
      addEntry(consoleMsg({ message: 'two', timestamp: base + 5000 }));
      expect(state.entries.length).toBe(1);

      // 15s later, past cooldown
      vi.setSystemTime(base + 15_000);
      addEntry(consoleMsg({ message: 'three', timestamp: base + 15_000 }));
      expect(state.entries.length).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('addEntry lookback dedup', () => {
  it('merges interleaved repeats (A,B,A,B) into two stable rows', () => {
    const ts = Date.now();
    addEntry(consoleMsg({ message: 'A', timestamp: ts }));
    addEntry(consoleMsg({ message: 'B', timestamp: ts + 1 }));
    addEntry(consoleMsg({ message: 'A', timestamp: ts + 2 }));
    addEntry(consoleMsg({ message: 'B', timestamp: ts + 3 }));
    expect(state.entries.length).toBe(2);
    expect(state.entries[0]?.message).toBe('A');
    expect(state.entries[0]?.count).toBe(2);
    expect(state.entries[1]?.message).toBe('B');
    expect(state.entries[1]?.count).toBe(2);
  });

  it('does not merge distinct network routes (the empty-message over-merge fix)', () => {
    const ts = Date.now();
    addEntry(networkMsg({ url: 'https://localhost/route/1', timestamp: ts }));
    addEntry(networkMsg({ url: 'https://localhost/route/2', timestamp: ts + 1 }));
    addEntry(networkMsg({ url: 'https://localhost/route/3', timestamp: ts + 2 }));
    expect(state.entries.length).toBe(3);
  });

  it('merges repeated identical network failures', () => {
    const ts = Date.now();
    addEntry(networkMsg({ url: 'https://localhost/api', status: 500, timestamp: ts }));
    addEntry(networkMsg({ url: 'https://localhost/api', status: 500, timestamp: ts + 50 }));
    expect(state.entries.length).toBe(1);
    expect(state.entries[0]?.count).toBe(2);
  });
});

describe('addEntry flood guard', () => {
  it('pauses capture once the event rate exceeds the threshold', () => {
    const ts = Date.now();
    // Distinct messages (so dedup doesn't merge them) within one rate window.
    for (let i = 0; i < FLOOD_RATE + 5; i++) {
      addEntry(consoleMsg({ message: 'm' + String(i), timestamp: ts }));
    }
    expect(state.floodPaused).toBe(true);
    // Captured up to the threshold; the rest are dropped, not stored.
    expect(state.entries.length).toBe(FLOOD_RATE);
    expect(state.floodDropped).toBeGreaterThan(0);
  });

  it('drops (and counts) further events while paused, keeping the snapshot intact', () => {
    const ts = Date.now();
    for (let i = 0; i < FLOOD_RATE + 1; i++) {
      addEntry(consoleMsg({ message: 'm' + String(i), timestamp: ts }));
    }
    expect(state.floodPaused).toBe(true);
    const frozen = state.entries.length;
    const droppedBefore = state.floodDropped;
    addEntry(consoleMsg({ message: 'extra', timestamp: ts }));
    expect(state.entries.length).toBe(frozen); // snapshot unchanged
    expect(state.floodDropped).toBe(droppedBefore + 1);
  });

  it('resumes capture and clears the flood state', () => {
    const ts = Date.now();
    for (let i = 0; i < FLOOD_RATE + 1; i++) {
      addEntry(consoleMsg({ message: 'm' + String(i), timestamp: ts }));
    }
    expect(state.floodPaused).toBe(true);

    resumeCapture();
    expect(state.floodPaused).toBe(false);
    expect(state.floodDropped).toBe(0);

    // A spaced-out event (fresh rate window) is captured again.
    const before = state.entries.length;
    addEntry(consoleMsg({ message: 'after', timestamp: ts + 10_000 }));
    expect(state.entries.length).toBe(before + 1);
  });
});
