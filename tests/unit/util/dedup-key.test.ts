import { describe, expect, it } from 'vitest';

import { dedupKey } from '../../../src/overlay/util.js';

describe('dedupKey', () => {
  it('keys console-style events on kind + level + message', () => {
    expect(dedupKey({ kind: 'console', level: 'error', message: 'boom' })).toBe(
      'console|error|boom',
    );
  });

  it('distinguishes console level (error vs warn) for the same message', () => {
    expect(dedupKey({ kind: 'console', level: 'warn', message: 'boom' })).not.toBe(
      dedupKey({ kind: 'console', level: 'error', message: 'boom' }),
    );
  });

  it('keys network events on path, ignoring the query string', () => {
    const a = dedupKey({
      kind: 'network',
      method: 'GET',
      status: 500,
      url: 'https://x.test/api?a=1',
    });
    const b = dedupKey({
      kind: 'network',
      method: 'GET',
      status: 500,
      url: 'https://x.test/api?a=2',
    });
    expect(a).toBe(b);
  });

  it('distinguishes different network routes (fixes the empty-message over-merge)', () => {
    const r1 = dedupKey({
      kind: 'network',
      method: 'GET',
      status: 500,
      url: 'https://x.test/route/1',
    });
    const r2 = dedupKey({
      kind: 'network',
      method: 'GET',
      status: 500,
      url: 'https://x.test/route/2',
    });
    expect(r1).not.toBe(r2);
  });

  it('distinguishes method and status on the same path', () => {
    const base = { kind: 'network', method: 'GET', status: 500, url: 'https://x.test/a' };
    expect(dedupKey(base)).not.toBe(dedupKey({ ...base, method: 'POST' }));
    expect(dedupKey(base)).not.toBe(dedupKey({ ...base, status: 404 }));
  });

  it('never collides a network event with a console event', () => {
    const net = dedupKey({ kind: 'network', method: 'GET', status: 500, url: 'https://x.test/a' });
    const con = dedupKey({ kind: 'console', level: 'error', message: 'a' });
    expect(net).not.toBe(con);
  });
});
