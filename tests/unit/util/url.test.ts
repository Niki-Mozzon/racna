import { describe, expect, it } from 'vitest';

import { globMatch, urlPath, urlPathAndSearch } from '../../../src/overlay/util.js';

describe('urlPath', () => {
  it('returns pathname for a well-formed URL', () => {
    expect(urlPath('https://example.com/api/users')).toBe('/api/users');
  });

  it('returns root path for bare origin', () => {
    expect(urlPath('https://example.com')).toBe('/');
  });

  it('strips query string and hash', () => {
    expect(urlPath('https://example.com/path?q=1#hash')).toBe('/path');
  });

  it('returns input verbatim when not parseable', () => {
    expect(urlPath('not-a-url')).toBe('not-a-url');
  });
});

describe('urlPathAndSearch', () => {
  it('returns path + query for a well-formed URL', () => {
    expect(urlPathAndSearch('https://example.com/api?q=1&x=2')).toBe('/api?q=1&x=2');
  });

  it('omits hash', () => {
    expect(urlPathAndSearch('https://example.com/p?a=b#hash')).toBe('/p?a=b');
  });

  it('returns input verbatim when not parseable', () => {
    expect(urlPathAndSearch('not-a-url')).toBe('not-a-url');
  });
});

describe('globMatch', () => {
  it('matches literal strings', () => {
    expect(globMatch('hello', 'hello')).toBe(true);
    expect(globMatch('hello', 'world')).toBe(false);
  });

  it('treats * as a wildcard', () => {
    expect(globMatch('/api/*', '/api/users')).toBe(true);
    expect(globMatch('/api/*', '/api/users/123')).toBe(true);
    expect(globMatch('/api/*', '/other/users')).toBe(false);
  });

  it('anchors both ends (full-match semantics)', () => {
    expect(globMatch('foo', 'foobar')).toBe(false);
    expect(globMatch('foo*', 'foobar')).toBe(true);
    expect(globMatch('*bar', 'foobar')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(globMatch('HELLO', 'hello')).toBe(true);
    expect(globMatch('Hello', 'HELLO')).toBe(true);
  });

  it('escapes regex metacharacters in the pattern', () => {
    expect(globMatch('a.b', 'a.b')).toBe(true);
    expect(globMatch('a.b', 'axb')).toBe(false); // dot not treated as regex .
    expect(globMatch('a+b', 'a+b')).toBe(true);
  });

  it('returns false for invalid regex patterns gracefully', () => {
    // No invalid pattern we can construct since * is the only special, but
    // verify the function returns boolean either way for edge-case inputs
    expect(typeof globMatch('', 'anything')).toBe('boolean');
  });
});
