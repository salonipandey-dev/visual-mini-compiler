/**
 * document.ts — the editor's source text and where it came from.
 *
 * Two ideas are kept deliberately separate:
 *
 *   revision  Increases on EVERY change: typing, Undo, Open, Load Example, even
 *             when the new text is identical. Compilation validity compares
 *             revisions, so any change requires compiling again.
 *
 *   baseline  The text of the last successful Open or Load Example. "Unsaved
 *             changes" compares the text with it, so Undo back to the baseline
 *             text clears the indicator while the compilation stays stale.
 *
 * Downloading never moves the baseline: the page can start a download, but the
 * browser never confirms whether, or where, the file was written.
 */
import { normalizeSource } from '../compiler';
import { toMclFileName } from './sourceFile';

export type SourceOrigin =
  | { readonly kind: 'file'; readonly fileName: string }
  | { readonly kind: 'example'; readonly exampleId: string; readonly title: string };

/** A download this page STARTED. It is never treated as a confirmed save. */
export interface DownloadRecord {
  readonly fileName: string;
  /** The exact text handed to the browser. */
  readonly text: string;
  /** Milliseconds since 1970, when the download was started. */
  readonly startedAt: number;
}

export interface SourceDocument {
  readonly text: string;
  readonly revision: number;
  readonly origin: SourceOrigin;
  readonly baseline: string;
  readonly lastDownload: DownloadRecord | null;
}

/** clean: text equals the baseline. download-started: unsaved, but this exact text was offered as a download. */
export type SaveStatus = 'clean' | 'unsaved' | 'download-started';

export function createDocument(text: string, origin: SourceOrigin): SourceDocument {
  const normalized = normalizeSource(text);
  return Object.freeze({ text: normalized, revision: 0, origin, baseline: normalized, lastDownload: null });
}

/** The user edited the text (typing, paste, Undo, Redo). */
export function editDocument(document: SourceDocument, text: string): SourceDocument {
  return Object.freeze({ ...document, text: normalizeSource(text), revision: document.revision + 1 });
}

/**
 * A successful Open or Load Example: replace everything at once. The revision
 * always increases, even for identical text, so the old compilation is invalid.
 */
export function replaceDocument(document: SourceDocument, text: string, origin: SourceOrigin): SourceDocument {
  const normalized = normalizeSource(text);
  return Object.freeze({
    text: normalized,
    revision: document.revision + 1,
    origin,
    baseline: normalized,
    lastDownload: null,
  });
}

/** Record that a download was started. Text, revision, and baseline are unchanged. */
export function noteDownloadStarted(document: SourceDocument, fileName: string, startedAt: number): SourceDocument {
  return Object.freeze({
    ...document,
    lastDownload: Object.freeze({ fileName, text: document.text, startedAt }),
  });
}

export function hasUnsavedChanges(document: SourceDocument): boolean {
  return document.text !== document.baseline;
}

export function saveStatus(document: SourceDocument): SaveStatus {
  if (!hasUnsavedChanges(document)) return 'clean';
  return document.lastDownload?.text === document.text ? 'download-started' : 'unsaved';
}

/** What the file bar shows as the document's name. */
export function documentLabel(document: SourceDocument): string {
  return document.origin.kind === 'file'
    ? document.origin.fileName
    : `Untitled (example: ${document.origin.title})`;
}

/** The name offered for Download: the opened file's name, or the example's id, ending in .mcl. */
export function suggestedFileName(document: SourceDocument): string {
  return document.origin.kind === 'file'
    ? toMclFileName(document.origin.fileName)
    : toMclFileName(document.origin.exampleId);
}
