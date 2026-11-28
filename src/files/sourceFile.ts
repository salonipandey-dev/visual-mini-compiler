/**
 * sourceFile.ts — reading a chosen file as .mcl source, and naming files.
 *
 * Reading uses only standard APIs (Blob.arrayBuffer and TextDecoder), so it
 * works in every current browser and in Node for tests.
 *
 * Policy:
 * - The bytes must be valid UTF-8. Invalid bytes are an error, never replaced
 *   with substitute characters. A leading UTF-8 byte-order mark is removed.
 * - CRLF and lone CR become LF (the language's newline policy).
 * - The text is never truncated. A file over MAX_OPEN_BYTES is refused before
 *   reading, so the browser is not asked to show megabytes in the editor; any
 *   smaller file loads in full, and Compile reports the 5,000-character limit.
 * - Language errors do not stop a file from loading: Compile reports them.
 */
import { normalizeSource } from '../compiler';

/** Files larger than this are refused, not truncated. Far above the 5,000-character language limit. */
export const MAX_OPEN_BYTES = 1024 * 1024;

/** The parts of a browser File this module needs (a real File satisfies it). */
export interface ReadableFile {
  readonly name: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type ReadOutcome =
  | { readonly ok: true; readonly fileName: string; readonly text: string }
  | {
      readonly ok: false;
      readonly fileName: string;
      readonly reason: 'too-large' | 'unreadable' | 'not-utf8';
      readonly message: string;
    };

export async function readSourceFile(file: ReadableFile): Promise<ReadOutcome> {
  const fileName = cleanFileName(file.name);
  const fail = (reason: 'too-large' | 'unreadable' | 'not-utf8', why: string): ReadOutcome =>
    Object.freeze({ ok: false, fileName, reason, message: `Could not open ${fileName}: ${why} The editor was not changed.` });

  if (file.size > MAX_OPEN_BYTES) {
    return fail('too-large', `the file is ${formatBytes(file.size)}, and files over ${formatBytes(MAX_OPEN_BYTES)} cannot be opened.`);
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return fail('unreadable', 'the browser could not read the file.');
  }

  let text: string;
  try {
    // fatal: true makes invalid UTF-8 an error instead of silently inserting U+FFFD.
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail('not-utf8', 'it is not valid UTF-8 text.');
  }

  return Object.freeze({ ok: true, fileName, text: normalizeSource(text) });
}

/** A safe display/download name: no folders, control characters, or characters Windows forbids. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .trim()
    .slice(0, 120);
  return cleaned === '' || /^\.+$/.test(cleaned) ? 'untitled.mcl' : cleaned;
}

/** marks.mcl stays; notes.txt becomes notes.mcl; program becomes program.mcl. */
export function toMclFileName(name: string): string {
  const cleaned = cleanFileName(name);
  if (/\.mcl$/i.test(cleaned) && cleaned.length > 4) return cleaned;
  const dot = cleaned.lastIndexOf('.');
  const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned;
  return (stem === '' || stem === '.mcl' ? 'untitled' : stem) + '.mcl';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
