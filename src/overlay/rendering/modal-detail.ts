import { BODY_MAX } from '../../shared/protocol.js';
import { getIconImg } from '../constants.js';
import { state } from '../state.js';
import { setCollapsedFields } from '../storage.js';
import { escAttr, escHtml, formatTime, statusClass, truncate } from '../util.js';

// The entry detail modal: a per-field breakdown of one captured entry, plus
// the Markdown builder that backs both the "Copy All" button and file export.
//
// Two builders: modalSectionSpecs() drives the on-screen sections (failure
// first, context after); buildModalText() assembles the copy text in its own
// order (page → context → error, or error-first when settings.aiFormat is
// on). The per-field `copyFields` toggles decide what's included in the text.

import type { CopyFieldKey, Entry } from '../../shared/types.js';

/** One collapsible field section: which copy-field it maps to, its heading,
 *  and its pre-escaped HTML content (empty string when this entry has none). */
interface ModalSectionSpec {
  key: CopyFieldKey;
  title: string;
  content: string;
}

/** Heading for the modal, specialised per entry kind. */
export function modalTitle(e: Entry): string {
  if (e.kind === 'network') return (e.method ?? 'GET') + ' ' + truncate(e.url ?? '', 70);
  if (e.kind === 'uncaught') return 'Uncaught Error';
  if (e.kind === 'rejection') return 'Unhandled Rejection';
  return e.level === 'warn' ? 'Console Warning' : 'Console Error';
}

function crumbType(c: NonNullable<Entry['breadcrumbs']>[number]): string {
  if (c.type === 'log') return c.level.toUpperCase();
  if (c.type === 'nav') return 'NAV  ';
  if (c.type === 'click') return 'CLICK';
  return 'HTTP ';
}

export function breadcrumbsHtml(e: Entry): string {
  if (!e.breadcrumbs || e.breadcrumbs.length === 0) return '';
  const lines = e.breadcrumbs.map(
    (c) => formatTime(c.timestamp) + '  ' + crumbType(c) + '  ' + c.message,
  );
  return escHtml(lines.join('\n'));
}

export function formatHeaders(obj: Record<string, string> | null): string {
  if (!obj || typeof obj !== 'object') return '';
  return escHtml(
    Object.keys(obj)
      .map((k) => k + ': ' + (obj[k] ?? ''))
      .join('\n'),
  );
}

/** Pretty-print a body as indented JSON when it parses as JSON, otherwise show
 *  it verbatim. Either way the result is HTML-escaped. */
export function formatBody(body: string | null): string {
  if (!body) return '';
  const str = body;
  try {
    return escHtml(JSON.stringify(JSON.parse(str), null, 2));
  } catch {
    return escHtml(str);
  }
}

/** Build the ordered field list for an entry. The two branches mirror the
 *  network vs console split; sections with no data get an empty `content` and
 *  render as a greyed-out "empty" row. This is the on-screen order: failure first,
 *  context after. The copy/export order is built independently in buildModalText(). */
export function modalSectionSpecs(e: Entry): ModalSectionSpec[] {
  const specs: ModalSectionSpec[] = [];
  if (e.kind === 'network') {
    specs.push({
      key: 'request',
      title: 'Request',
      content: escHtml((e.method ?? 'GET') + ' ' + (e.url ?? '')),
    });
    specs.push({
      key: 'requestHeaders',
      title: 'Request Headers',
      content: e.reqHeaders ? formatHeaders(e.reqHeaders) : '',
    });
    specs.push({
      key: 'requestBody',
      title: 'Request Body',
      content: e.reqBody ? formatBody(e.reqBody) : '',
    });
    const statusStr =
      (e.status === 0 ? 'Network Error' : String(e.status)) +
      (e.statusText ? ' ' + e.statusText : '') +
      ' (' +
      String(e.duration ?? 0) +
      ' ms)';
    specs.push({ key: 'response', title: 'Response', content: escHtml(statusStr) });
    specs.push({
      key: 'responseHeaders',
      title: 'Response Headers',
      content: e.resHeaders ? formatHeaders(e.resHeaders) : '',
    });
    specs.push({
      key: 'responseBody',
      title: 'Response Body',
      content: e.resBody ? formatBody(e.resBody) : '',
    });
    specs.push({
      key: 'callStack',
      title: 'Call Stack',
      content: e.stack ? escHtml(e.stack) : '',
    });
  } else {
    specs.push({ key: 'message', title: 'Message', content: escHtml(e.message) });
    specs.push({ key: 'stack', title: 'Stack Trace', content: e.stack ? escHtml(e.stack) : '' });
    specs.push({
      key: 'location',
      title: 'Location',
      content: e.filename && e.lineno != null ? escHtml(e.filename + ':' + String(e.lineno)) : '',
    });
  }
  specs.push({ key: 'breadcrumbs', title: 'Breadcrumbs', content: breadcrumbsHtml(e) });
  specs.push({ key: 'pageUrl', title: 'Page', content: e.pageUrl ? escHtml(e.pageUrl) : '' });
  specs.push({ key: 'userAgent', title: 'Browser', content: escHtml(navigator.userAgent) });
  specs.push({
    key: 'seen',
    title: 'Seen',
    content:
      e.count > 1
        ? escHtml(
            'First: ' +
              formatTime(e.firstSeen) +
              '  -  Last: ' +
              formatTime(e.timestamp) +
              '  ×' +
              String(e.count),
          )
        : '',
  });
  return specs;
}

/** Render one section: a heading with a collapse chevron and an
 *  include-in-copy toggle, plus the body when present and expanded. Empty
 *  sections are shown but flagged so the user knows the field had no data. */
function modalSection(title: string, contentHtml: string, fieldKey: CopyFieldKey): string {
  const cf = state.settings.copyFields;
  const collapsed = !!state.settings.collapsedFields[fieldKey];
  const hasContent = !!contentHtml;
  const checked = cf[fieldKey] !== false ? ' checked' : '';
  const stateClass = !hasContent ? 'msec-empty' : collapsed ? 'msec-collapsed' : 'msec-expanded';
  const chevron = hasContent
    ? '<span class="msec-chevron">' + (collapsed ? '▸' : '▾') + '</span>'
    : '';
  const emptyTag = hasContent ? '' : '<span class="msec-empty-tag">empty</span>';
  const toggleTitle = hasContent
    ? 'Include in Copy All'
    : 'Include in Copy All (no content in this entry)';
  const toggle =
    '<label class="sswitch sswitch-sm" title="' +
    escAttr(toggleTitle) +
    '">' +
    '<input type="checkbox" data-copy-field="' +
    escHtml(fieldKey) +
    '"' +
    checked +
    '>' +
    '<span class="sslider"></span>' +
    '</label>';
  const body = hasContent && !collapsed ? '<pre class="msec-body">' + contentHtml + '</pre>' : '';
  return (
    '<div class="msec ' +
    stateClass +
    '" data-field-key="' +
    escHtml(fieldKey) +
    '">' +
    '<div class="msec-title">' +
    '<span class="msec-title-text">' +
    chevron +
    escHtml(title) +
    emptyTag +
    '</span>' +
    toggle +
    '</div>' +
    body +
    '</div>'
  );
}

export function buildModalHtml(e: Entry): string {
  return modalSectionSpecs(e)
    .map((s) => modalSection(s.title, s.content, s.key))
    .join('');
}

export function refreshModalBody(): void {
  if (state.currentModalEntry && state.modalBodyEl) {
    state.modalBodyEl.innerHTML = buildModalHtml(state.currentModalEntry);
  }
}

/** Open the detail modal for an entry. The Replay button only appears when the
 *  entry has a storeId (network rows have none; nothing to re-log). */
export function showModal(e: Entry): void {
  if (!state.modalEl || !state.modalBodyEl) return;
  state.currentModalEntry = e;
  const titleEl = state.modalEl.querySelector('.modal-title');
  if (titleEl) {
    if (e.kind === 'network') {
      const label = e.status === 0 ? 'ERR' : String(e.status ?? '');
      titleEl.innerHTML =
        getIconImg() +
        '<span>' +
        escHtml(e.method ?? 'GET') +
        '</span>' +
        '<span class="mstatus ' +
        statusClass(e.status) +
        '"' +
        (e.statusText ? ' title="' + escAttr(e.statusText) + '"' : '') +
        '>' +
        escHtml(label) +
        '</span>' +
        '<span class="modal-title-text">' +
        escHtml(e.url ?? '') +
        '</span>';
    } else {
      titleEl.innerHTML =
        getIconImg() + '<span class="modal-title-text">' + escHtml(modalTitle(e)) + '</span>';
    }
  }
  const replayBtn = state.modalEl.querySelector<HTMLButtonElement>('[data-action="replay"]');
  if (replayBtn) {
    replayBtn.style.display = e.storeId != null ? '' : 'none';
    replayBtn.setAttribute('data-store-id', e.storeId != null ? String(e.storeId) : '');
  }
  state.modalBodyEl.innerHTML = buildModalHtml(e);
  const aiToggle = state.modalEl.querySelector<HTMLInputElement>('#ai-format');
  if (aiToggle) aiToggle.checked = state.settings.aiFormat;
  state.modalEl.style.display = '';
}

export function hideModal(): void {
  if (!state.modalEl) return;
  state.currentModalEntry = null;
  state.modalEl.style.display = 'none';
}

/** Fold/unfold a section, persisting the choice. We delete the key (rather than
 *  set false) so collapsedFields only ever stores the collapsed ones. */
export function toggleFieldCollapsed(key: CopyFieldKey): void {
  const collapsed = state.settings.collapsedFields;
  if (collapsed[key]) Reflect.deleteProperty(collapsed, key);
  else collapsed[key] = true;
  setCollapsedFields(collapsed);
  refreshModalBody();
}

// ── Markdown export builder ───────────────────────────────────────────────

// Headers whose values are credentials: never include them in an AI prompt,
// which users paste into third-party tools.
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
]);

/** Format a header bag as `key: value` lines, masking credential values when
 *  `redact` is on (settings.redactSensitive, default on). */
function headerLines(h: Record<string, string>, redact: boolean): string[] {
  return Object.keys(h).map((k) => {
    const v = redact && SENSITIVE_HEADERS.has(k.toLowerCase()) ? '[redacted]' : (h[k] ?? '');
    return k + ': ' + v;
  });
}

/** Wrap a block in a Markdown fence so payloads can't bleed into the prose
 *  around them. Uses a longer fence when the text already contains one. */
function fence(text: string): string {
  const marker = text.includes('```') ? '````' : '```';
  return marker + '\n' + text + '\n' + marker;
}

/** Append an explicit truncation note when a body hit the interceptor's
 *  capture cap, so an AI reading it knows the payload is incomplete. */
function markTruncation(body: string): string {
  return body.length >= BODY_MAX
    ? body + '\n[body truncated at ' + String(BODY_MAX) + ' characters]'
    : body;
}

/**
 * Build the plain-text/Markdown representation of an entry, used both by the
 * "Copy All" button and by file export. Only fields whose copy toggle is on
 * are included.
 *
 * When `settings.aiFormat` is on the output is tailored for AI tools: blocks
 * are reordered error-first (error → context → page), multi-line payloads are
 * fenced, capped bodies get a truncation note, and breadcrumbs become a
 * timeline ending at the failure. Otherwise the order is human-friendly
 * (page → context → error) and content is copied verbatim.
 *
 * Independently of the format, credential headers are masked in the output
 * while `settings.redactSensitive` is on.
 */
export function buildModalText(e: Entry): string {
  const cf = state.settings.copyFields;
  const include = (key: CopyFieldKey): boolean => cf[key] !== false;
  const isAi = state.settings.aiFormat;
  const redact = state.settings.redactSensitive;

  const pageSection: string[] = [];
  const contextSection: string[] = [];
  const errorSection: string[] = [];

  if (e.pageUrl && include('pageUrl')) pageSection.push('PAGE: ' + e.pageUrl);
  if (include('userAgent')) contextSection.push('BROWSER: ' + navigator.userAgent);
  if (e.count > 1 && include('seen')) {
    contextSection.push(
      'SEEN: First ' +
        formatTime(e.firstSeen) +
        ', Last ' +
        formatTime(e.timestamp) +
        ' ×' +
        String(e.count),
    );
  }
  if (e.breadcrumbs && e.breadcrumbs.length > 0 && include('breadcrumbs')) {
    const crumbLines = e.breadcrumbs.map(
      (c) => formatTime(c.timestamp) + '  ' + crumbType(c) + '  ' + c.message,
    );
    if (isAi) {
      crumbLines.push(formatTime(e.timestamp) + '  FAIL   this entry (see above)');
      contextSection.push('\nTIMELINE (oldest first, ends at this failure):');
      contextSection.push(fence(crumbLines.join('\n')));
    } else {
      contextSection.push('\nBREADCRUMBS:');
      contextSection.push(...crumbLines);
    }
  }
  if (e.kind === 'network') {
    if (include('request')) {
      errorSection.push('\nREQUEST: ' + (e.method ?? 'GET') + ' ' + (e.url ?? ''));
    }
    if (e.reqHeaders && include('requestHeaders')) {
      const lines = headerLines(e.reqHeaders, redact);
      errorSection.push('\nREQUEST HEADERS:');
      errorSection.push(isAi ? fence(lines.join('\n')) : lines.join('\n'));
    }
    if (e.reqBody && include('requestBody')) {
      errorSection.push('\nREQUEST BODY:');
      errorSection.push(isAi ? fence(markTruncation(e.reqBody)) : e.reqBody);
    }
    if (include('response')) {
      errorSection.push(
        '\nRESPONSE: ' +
          (e.status === 0 ? 'Network Error' : String(e.status ?? '')) +
          (e.statusText ? ' ' + e.statusText : '') +
          ' (' +
          String(e.duration ?? 0) +
          ' ms)',
      );
    }
    if (e.resHeaders && include('responseHeaders')) {
      const lines = headerLines(e.resHeaders, redact);
      errorSection.push('\nRESPONSE HEADERS:');
      errorSection.push(isAi ? fence(lines.join('\n')) : lines.join('\n'));
    }
    if (e.resBody && include('responseBody')) {
      errorSection.push('\nRESPONSE BODY:');
      errorSection.push(isAi ? fence(markTruncation(e.resBody)) : e.resBody);
    }
    if (e.stack && include('callStack')) {
      errorSection.push('\nCALL STACK:');
      errorSection.push(isAi ? fence(e.stack) : e.stack);
    }
  } else {
    if (include('message')) errorSection.push('\nMESSAGE: ' + e.message);
    if (e.stack && include('stack')) {
      errorSection.push('\nSTACK:');
      errorSection.push(isAi ? fence(e.stack) : e.stack);
    } else if (e.filename && include('location')) {
      errorSection.push('LOCATION: ' + e.filename + ':' + String(e.lineno ?? ''));
    }
  }

  let lines: string[] = [];
  if (isAi) {
    lines = lines.concat(errorSection, contextSection, pageSection);
  } else {
    lines = lines.concat(pageSection, contextSection, errorSection);
  }
  return lines.join('\n').trimStart();
}
