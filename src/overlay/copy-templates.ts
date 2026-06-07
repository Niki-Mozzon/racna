import {
  refreshModalBody,
  renderCopyTemplatePicker,
  templateFieldsDiffer,
} from './rendering/modal-detail.js';
import { BUILTIN_COPY_TEMPLATES, DEFAULTS, state } from './state.js';
import { setActiveCopyTemplateIdInStorage, setCopyFields, setCopyTemplates } from './storage.js';

// Copy-template logic: presets + user-defined templates that control which
// fields land on the clipboard / in an export. A "template" is just a frozen
// set of field flags; applying one writes those flags into the live
// settings.copyFields. Built-ins (id `builtin:*`) are read-only; customs
// (`custom:*`) can be saved, updated, and deleted.

import type { CopyFieldKey, CopyFields, CopyTemplate, Entry } from '../shared/types.js';

/** Set the active template and persist the choice (both in state and storage). */
export function setActiveCopyTemplateId(id: string | null): void {
  state.activeCopyTemplateId = id;
  setActiveCopyTemplateIdInStorage(id);
}

// The full, canonical field order, derived from DEFAULTS so it can never drift
// out of sync with the Settings type.
const COPY_FIELD_KEYS = Object.keys(DEFAULTS.copyFields) as CopyFieldKey[];

/** Which fields actually apply to this entry's kind: network entries have
 *  request/response fields, console entries have message/stack/location. Used
 *  to show only meaningful toggles and to only save relevant flags into a
 *  template. With no entry, returns everything. */
export function relevantFieldsForEntry(e: Entry | null): CopyFieldKey[] {
  if (!e) return [...COPY_FIELD_KEYS];
  const common: CopyFieldKey[] = ['pageUrl', 'userAgent', 'seen', 'breadcrumbs'];
  if (e.kind === 'network') {
    return [
      ...common,
      'request',
      'requestHeaders',
      'requestBody',
      'response',
      'responseHeaders',
      'responseBody',
      'callStack',
    ];
  }
  return [...common, 'message', 'stack', 'location'];
}

/** Rewrite the live copyFields from a (possibly sparse) flag map, coercing
 *  every known key to a strict boolean so absent keys become explicit `false`. */
export function normalizeCopyFieldsTo(fields: Partial<Record<CopyFieldKey, unknown>>): void {
  const next: CopyFields = {};
  for (const k of COPY_FIELD_KEYS) {
    next[k] = !!fields[k];
  }
  state.settings.copyFields = next;
  setCopyFields(next);
  refreshModalBody();
}

/** Apply a template (built-in or custom) by id: copy its flags into the live
 *  fields and mark it active. No-op if the id isn't found. */
export function applyCopyTemplate(id: string): void {
  const all: CopyTemplate[] = [...BUILTIN_COPY_TEMPLATES, ...state.settings.copyTemplates];
  const tpl = all.find((t) => t.id === id);
  if (!tpl) return;
  const next: CopyFields = {};
  for (const k of COPY_FIELD_KEYS) {
    next[k] = !!tpl.fields[k];
  }
  state.settings.copyFields = next;
  setCopyFields(next);
  setActiveCopyTemplateId(id);
  refreshModalBody();
  renderCopyTemplatePicker();
}

/** Save the current field selection as a new custom template (prompts for a
 *  name). Only the fields relevant to the current entry are stored, so e.g. a
 *  template saved from a console error won't carry dead network flags. */
export function handleSaveCopyTemplate(): void {
  const name = (window.prompt('Template name?') ?? '').trim();
  if (!name) return;
  // custom: prefix marks it user-editable; the suffix is a cheap unique id.
  const id = 'custom:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const visible = relevantFieldsForEntry(state.currentModalEntry);
  const fields: Partial<Record<CopyFieldKey, 1>> = {};
  for (const k of visible) {
    if (state.settings.copyFields[k]) fields[k] = 1;
  }
  const customs: CopyTemplate[] = [...state.settings.copyTemplates, { id, name, fields }];
  state.settings.copyTemplates = customs;
  setCopyTemplates(customs);
  normalizeCopyFieldsTo(fields);
  setActiveCopyTemplateId(id);
  renderCopyTemplatePicker();
}

/** Overwrite the active custom template with the current field selection.
 *  Refuses on built-ins (they're immutable) or when nothing is active. */
export function handleUpdateActiveTemplate(): void {
  const activeId = state.activeCopyTemplateId;
  if (!activeId || activeId.startsWith('builtin:')) return;
  const visible = relevantFieldsForEntry(state.currentModalEntry);
  const fields: Partial<Record<CopyFieldKey, 1>> = {};
  for (const k of visible) {
    if (state.settings.copyFields[k]) fields[k] = 1;
  }
  const customs = state.settings.copyTemplates.map((t) =>
    t.id === activeId ? { ...t, fields } : t,
  );
  state.settings.copyTemplates = customs;
  setCopyTemplates(customs);
  normalizeCopyFieldsTo(fields);
  renderCopyTemplatePicker();
}

export { templateFieldsDiffer };
