import { COPY_FIELD_LABELS, getIconImg } from '../constants.js';
import { BUILTIN_COPY_TEMPLATES, state } from '../state.js';
import { setCollapsedFields } from '../storage.js';
import { escAttr, escHtml, formatTime, statusClass, truncate } from '../util.js';

// The entry detail modal: a per-field breakdown of one captured entry, plus
// the copy-template picker and the Markdown builder that backs both the
// "Copy All" button and file export.
//
// Two builders: modalSectionSpecs() drives the on-screen sections (failure
// first, context after); buildModalText() assembles the copy text in its own
// order (page → context → error, or error-first for the AI template). The
// per-field `copyFields` toggles decide what's included in the text output.

import type { CopyFieldKey, CopyTemplate, Entry } from '../../shared/types.js';

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
  renderCopyTemplatePicker();
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

// ── Copy template picker (lives on the detail modal) ──────────────────────

function fieldListText(fields: Partial<Record<CopyFieldKey, unknown>>): string {
  const included = (Object.keys(COPY_FIELD_LABELS) as CopyFieldKey[]).filter((k) => !!fields[k]);
  if (!included.length) return '(no fields)';
  return '  • ' + included.map((k) => COPY_FIELD_LABELS[k]).join('\n  • ');
}

function copyTemplateTooltip(
  tpl: CopyTemplate,
  currentFields: Partial<Record<CopyFieldKey, unknown>> | null,
): string {
  const savedSection = tpl.name + '\nApplies:\n' + fieldListText(tpl.fields);
  if (!currentFields) return savedSection;
  return (
    savedSection + '\n\nCurrently checked:\n' + fieldListText(currentFields) + '\n(unsaved changes)'
  );
}

/** Does the live field selection differ from the template's saved set? Drives
 *  the "unsaved changes" marker and the Update option in the picker. */
export function templateFieldsDiffer(
  tpl: CopyTemplate,
  fields: Partial<Record<CopyFieldKey, boolean>>,
): boolean {
  return (Object.keys(COPY_FIELD_LABELS) as CopyFieldKey[]).some(
    (k) => !!tpl.fields[k] !== !!fields[k],
  );
}

/** Rebuild the template <select>: built-in group, custom group (with a `*`
 *  dirty marker on the active one if edited), a one-off "Update …" option when
 *  the active custom template has unsaved changes, and "Save current as …".
 *  The delete button shows only for an active custom template. */
export function renderCopyTemplatePicker(): void {
  if (!state.modalEl) return;
  const sel = state.modalEl.querySelector('.copy-template-picker');
  const delBtn = state.modalEl.querySelector<HTMLElement>('.copy-template-delete');
  if (!sel) return;
  const customs = state.settings.copyTemplates;
  const opts: string[] = [];
  opts.push(
    '<option value="" disabled' +
      (!state.activeCopyTemplateId ? ' selected' : '') +
      '>Template…</option>',
  );
  opts.push('<optgroup label="Built-in">');
  for (const t of BUILTIN_COPY_TEMPLATES) {
    const s = state.activeCopyTemplateId === t.id ? ' selected' : '';
    opts.push(
      '<option value="' +
        escHtml(t.id) +
        '" title="' +
        escHtml(copyTemplateTooltip(t, null)) +
        '"' +
        s +
        '>' +
        escHtml(t.name) +
        '</option>',
    );
  }
  opts.push('</optgroup>');
  if (customs.length > 0) {
    opts.push('<optgroup label="My templates">');
    for (const t of customs) {
      const isActive = state.activeCopyTemplateId === t.id;
      const dirty = isActive && templateFieldsDiffer(t, state.settings.copyFields);
      const label = escHtml(t.name) + (dirty ? ' *' : '');
      const tip = escHtml(copyTemplateTooltip(t, dirty ? state.settings.copyFields : null));
      const s = isActive ? ' selected' : '';
      opts.push(
        '<option value="' + escHtml(t.id) + '" title="' + tip + '"' + s + '>' + label + '</option>',
      );
    }
    opts.push('</optgroup>');
  }
  const isCustomActive =
    !!state.activeCopyTemplateId && !state.activeCopyTemplateId.startsWith('builtin:');
  if (isCustomActive) {
    const activeTpl = state.settings.copyTemplates.find((t) => t.id === state.activeCopyTemplateId);
    if (activeTpl && templateFieldsDiffer(activeTpl, state.settings.copyFields)) {
      opts.push(
        '<option value="__update__" title="Overwrite this template with the currently checked fields">↻ Update "' +
          escHtml(activeTpl.name) +
          '"</option>',
      );
    }
  }
  opts.push('<option value="__save__">＋ Save current as template…</option>');
  sel.innerHTML = opts.join('');
  if (delBtn) delBtn.style.display = isCustomActive ? '' : 'none';
}

// ── Markdown export builder ───────────────────────────────────────────────

/**
 * Build the plain-text/Markdown representation of an entry, used both for the
 * "Copy All" button and for file export. Only fields whose copy toggle is on
 * are included.
 *
 * The "AI Debug" template (`builtin:ai`) is special: it prepends a diagnosis
 * prompt and reorders the blocks error-first (error → context → page), since
 * an LLM benefits from leading with the failure. Every other template keeps the
 * human-friendly order (page → context → error).
 */
export function buildModalText(e: Entry): string {
  const cf = state.settings.copyFields;
  const include = (key: CopyFieldKey): boolean => cf[key] !== false;
  const isAi = state.activeCopyTemplateId === 'builtin:ai';

  // Three buckets, filled independently, then concatenated in an order that
  // depends on the AI flag (see below).
  const pageSection: string[] = [];
  const contextSection: string[] = [];
  const errorSection: string[] = [];

  if (e.pageUrl && include('pageUrl')) pageSection.push('PAGE: ' + e.pageUrl);
  if (include('userAgent')) contextSection.push('BROWSER: ' + navigator.userAgent);
  if (e.count > 1 && include('seen')) {
    contextSection.push(
      'SEEN: First ' +
        formatTime(e.firstSeen) +
        ' - Last ' +
        formatTime(e.timestamp) +
        ' ×' +
        String(e.count),
    );
  }
  if (e.breadcrumbs && e.breadcrumbs.length > 0 && include('breadcrumbs')) {
    contextSection.push('\nBREADCRUMBS:');
    for (const c of e.breadcrumbs) {
      contextSection.push(formatTime(c.timestamp) + '  ' + crumbType(c) + '  ' + c.message);
    }
  }
  if (e.kind === 'network') {
    if (include('request')) {
      errorSection.push('\nREQUEST: ' + (e.method ?? 'GET') + ' ' + (e.url ?? ''));
    }
    if (e.reqHeaders && include('requestHeaders')) {
      errorSection.push('\nREQUEST HEADERS:');
      for (const k of Object.keys(e.reqHeaders)) {
        errorSection.push(k + ': ' + (e.reqHeaders[k] ?? ''));
      }
    }
    if (e.reqBody && include('requestBody')) {
      errorSection.push('\nREQUEST BODY:');
      errorSection.push(e.reqBody);
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
      errorSection.push('\nRESPONSE HEADERS:');
      for (const k of Object.keys(e.resHeaders)) {
        errorSection.push(k + ': ' + (e.resHeaders[k] ?? ''));
      }
    }
    if (e.resBody && include('responseBody')) {
      errorSection.push('\nRESPONSE BODY:');
      errorSection.push(e.resBody);
    }
    if (e.stack && include('callStack')) {
      errorSection.push('\nCALL STACK:');
      errorSection.push(e.stack);
    }
  } else {
    if (include('message')) errorSection.push('\nMESSAGE: ' + e.message);
    if (e.stack && include('stack')) {
      errorSection.push('\nSTACK:');
      errorSection.push(e.stack);
    } else if (e.filename && include('location')) {
      errorSection.push('LOCATION: ' + e.filename + ':' + String(e.lineno ?? ''));
    }
  }

  let lines: string[] = [];
  if (isAi) {
    lines.push(
      'Help diagnose this captured browser error. Identify the likely root cause and where to look in the code.\n',
    );
    lines = lines.concat(errorSection, contextSection, pageSection);
  } else {
    lines = lines.concat(pageSection, contextSection, errorSection);
  }
  return lines.join('\n');
}
