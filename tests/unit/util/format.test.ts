import { describe, expect, it } from 'vitest';

import {
  escAttr,
  escHtml,
  formatTime,
  linkifyHtml,
  nowFilenameTag,
  statusClass,
  truncate,
} from '../../../src/overlay/util.js';

describe('truncate', () => {
  it('returns the original string when within length', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('appends ellipsis when over length', () => {
    expect(truncate('hello world', 5)).toBe('hello…');
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
  });

  it('handles exact length boundary', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});

describe('formatTime', () => {
  it('formats a known timestamp as HH:MM:SS', () => {
    // 2024-01-15 14:30:45 in local time
    const ts = new Date(2024, 0, 15, 14, 30, 45).getTime();
    expect(formatTime(ts)).toBe('14:30:45');
  });

  it('zero-pads small numbers', () => {
    const ts = new Date(2024, 0, 15, 1, 2, 3).getTime();
    expect(formatTime(ts)).toBe('01:02:03');
  });
});

describe('nowFilenameTag', () => {
  it('produces a YYYY-MM-DD-HHMM tag', () => {
    expect(nowFilenameTag()).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}$/);
  });
});

describe('escHtml', () => {
  it('escapes &, <, >', () => {
    expect(escHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });

  it('preserves quotes (only used in body, not attrs)', () => {
    expect(escHtml('"hello"')).toBe('"hello"');
  });

  it('handles non-string inputs by stringifying', () => {
    expect(escHtml(42)).toBe('42');
    expect(escHtml(null)).toBe('null');
  });

  it('escapes & before other chars to avoid double-escape', () => {
    expect(escHtml('&lt;')).toBe('&amp;lt;');
  });
});

describe('escAttr', () => {
  it('escapes & and double quotes', () => {
    expect(escAttr('a & "b"')).toBe('a &amp; &quot;b&quot;');
  });

  it('preserves < and > (only used in attribute context)', () => {
    expect(escAttr('<tag>')).toBe('<tag>');
  });
});

describe('linkifyHtml', () => {
  it('wraps http(s) URLs in anchor tags', () => {
    const out = linkifyHtml('visit https://example.com today');
    expect(out).toContain('<a class="snote-link"');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('>https://example.com</a>');
  });

  it('escapes HTML in surrounding text', () => {
    const out = linkifyHtml('a < b & c > https://x.test');
    expect(out).toContain('a &lt; b &amp; c &gt; ');
  });

  it('handles null and undefined gracefully', () => {
    expect(linkifyHtml(null)).toBe('');
    expect(linkifyHtml(undefined)).toBe('');
  });

  it('handles plain text with no URL', () => {
    expect(linkifyHtml('hello world')).toBe('hello world');
  });
});

describe('statusClass', () => {
  it('returns "serr" for status 0', () => {
    expect(statusClass(0)).toBe('serr');
  });

  it('returns "s5xx" for 500-599', () => {
    expect(statusClass(500)).toBe('s5xx');
    expect(statusClass(503)).toBe('s5xx');
    expect(statusClass(599)).toBe('s5xx');
  });

  it('returns "s4xx" for 400-499', () => {
    expect(statusClass(400)).toBe('s4xx');
    expect(statusClass(404)).toBe('s4xx');
    expect(statusClass(499)).toBe('s4xx');
  });

  it('returns "sother" for other codes', () => {
    expect(statusClass(200)).toBe('sother');
    expect(statusClass(301)).toBe('sother');
    expect(statusClass(null)).toBe('sother');
    expect(statusClass(undefined)).toBe('sother');
  });
});
