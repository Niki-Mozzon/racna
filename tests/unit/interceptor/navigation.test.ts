import { afterEach, describe, expect, it, vi } from 'vitest';

import { snapshotCrumbs } from '../../../src/interceptor/breadcrumbs.js';
import { initNavigation } from '../../../src/interceptor/navigation.js';
import { NAV_TYPE } from '../../../src/shared/protocol.js';

// Patch history once for this file (mirrors the single init in the real
// MAIN-world entry point).
initNavigation();

describe('initNavigation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('signals the overlay and records a breadcrumb on pushState to a new URL', () => {
    const post = vi.spyOn(window, 'postMessage');
    const before = snapshotCrumbs().length;

    history.pushState({}, '', '/route-' + String(Date.now()));

    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: NAV_TYPE }), '*');
    const crumbs = snapshotCrumbs();
    expect(crumbs.length).toBe(before + 1);
    expect(crumbs[crumbs.length - 1]?.type).toBe('nav');
  });

  it('still performs the underlying navigation', () => {
    const target = '/changed-' + String(Date.now());
    history.pushState({}, '', target);
    expect(window.location.pathname).toBe(target);
  });

  it('does not signal when replaceState leaves the URL unchanged', () => {
    history.replaceState({}, '', window.location.href); // normalise to current URL
    const post = vi.spyOn(window, 'postMessage');

    history.replaceState({ state: 1 }, '', window.location.href); // same URL, state only

    expect(post).not.toHaveBeenCalled();
  });
});
