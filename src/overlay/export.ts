// Export captured entries to a Markdown file. Reuses the same per-entry
// formatter the detail-view copy button uses (buildModalText), so an export is
// just N copies joined by horizontal rules.

import { buildModalText } from './rendering/modal-detail.js';
import { nowFilenameTag } from './util.js';

import type { Entry } from '../shared/types.js';

/** Download `text` as a file via a transient object-URL + synthetic anchor
 *  click (the standard no-server download trick). The URL is revoked on the
 *  next tick so the blob doesn't leak. */
export function triggerDownload(text: string, filename: string): void {
  try {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  } catch {
    /* download failed (e.g., blocked); ignore */
  }
}

/** Format the given entries to one Markdown doc and download it. Filename is
 *  stamped with date+time and the page host so multiple exports don't clash. */
export function exportEntries(entryArr: Entry[]): void {
  if (!entryArr.length) return;
  const parts = entryArr.map(buildModalText).filter((s) => s.length > 0);
  if (!parts.length) return;
  const md = parts.join('\n\n---\n\n') + '\n'; // `---` = Markdown horizontal rule between entries
  const host = window.location.hostname || 'page';
  triggerDownload(md, 'racna-' + nowFilenameTag() + '-' + host + '.md');
}
