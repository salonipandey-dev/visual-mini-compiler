import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler';
import { MAX_SOURCE_CHARACTERS } from '../src/compiler/source';
import {
  cleanFileName, createDocument, documentLabel, editDocument, hasUnsavedChanges, LatestRequest,
  MAX_OPEN_BYTES, noteDownloadStarted, readSourceFile, replaceDocument, saveStatus, sourceBlob,
  startDownload, suggestedFileName, toMclFileName, type DownloadEnvironment, type DownloadLink,
  type ReadableFile, type SourceDocument,
} from '../src/files';
import { runnableProgram } from '../src/runtime';

const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const file = (name: string, bytes: Uint8Array<ArrayBuffer> | string): File =>
  new File([typeof bytes === 'string' ? utf8(bytes) : bytes], name, { type: 'text/plain' });

const MARKS = 'let marks = 70;\nlet bonus = 5;\nprint marks + bonus;\n';
const exampleOrigin = { kind: 'example', exampleId: 'marks', title: 'Marks and bonus' } as const;
const fileOrigin = (fileName: string) => ({ kind: 'file', fileName }) as const;

async function readOk(input: ReadableFile): Promise<string> {
  const outcome = await readSourceFile(input);
  if (!outcome.ok) throw new Error('Expected a successful read: ' + outcome.message);
  return outcome.text;
}

describe('opening a file: UTF-8 and newlines', () => {
  it('reads valid UTF-8 source exactly, including non-ASCII comments', async () => {
    const text = '# caf\u00e9 \u2615 \u{1F600}\nlet marks = 70;\nprint marks;\n';
    const outcome = await readSourceFile(file('marks.mcl', text));
    expect(outcome).toEqual({ ok: true, fileName: 'marks.mcl', text });
  });

  it.each([
    ['CRLF', 'let a = 1;\r\nprint a;\r\n'],
    ['lone CR', 'let a = 1;\rprint a;\r'],
    ['mixed', 'let a = 1;\r\nprint a;\r'],
  ])('normalizes %s line endings to LF', async (_label, text) => {
    expect(await readOk(file('a.mcl', text))).toBe('let a = 1;\nprint a;\n');
  });

  it('removes a UTF-8 byte-order mark', async () => {
    expect(await readOk(file('bom.mcl', '\uFEFFprint 1;'))).toBe('print 1;');
  });

  it('rejects bytes that are not valid UTF-8 instead of substituting characters', async () => {
    const outcome = await readSourceFile(file('latin1.mcl', new Uint8Array([0x70, 0x72, 0x69, 0x6e, 0x74, 0x20, 0xe9, 0x3b])));
    expect(outcome).toMatchObject({ ok: false, reason: 'not-utf8', fileName: 'latin1.mcl' });
    if (!outcome.ok) expect(outcome.message).toBe('Could not open latin1.mcl: it is not valid UTF-8 text. The editor was not changed.');
  });

  it('refuses files over the open limit without reading them', async () => {
    let read = false;
    const huge: ReadableFile = {
      name: 'huge.mcl', size: MAX_OPEN_BYTES + 1,
      arrayBuffer: async () => { read = true; return new ArrayBuffer(0); },
    };
    const outcome = await readSourceFile(huge);
    expect(outcome).toMatchObject({ ok: false, reason: 'too-large' });
    expect(read).toBe(false);
  });

  it('reports a read failure as an error result', async () => {
    const broken: ReadableFile = { name: 'gone.mcl', size: 10, arrayBuffer: () => Promise.reject(new Error('NotReadableError')) };
    expect(await readSourceFile(broken)).toMatchObject({ ok: false, reason: 'unreadable', fileName: 'gone.mcl' });
  });

  it('reads the same file again with the same result', async () => {
    const chosen = file('marks.mcl', MARKS);
    expect(await readSourceFile(chosen)).toEqual(await readSourceFile(chosen));
  });
});

describe('opening a file: language rules are left to Compile', () => {
  it.each([
    ['lexical', 'print 1 @ 2;\n', 1, 9],
    ['syntax', 'let y = 5\nprint y;\n', 2, 1],
    ['semantic', 'print missing;\n', 1, 7],
  ])('loads source with a %s error; Compile reports it', async (phase, text, line, column) => {
    const loaded = await readOk(file('broken.mcl', text));
    expect(loaded).toBe(text);
    const result = compile(loaded);
    expect(result.failedPhase).toBe(phase);
    expect(result.diagnostics[0]).toMatchObject({ line, column });
  });

  it('loads source over the 5,000-character limit in full; Compile reports the limit', async () => {
    const text = '#'.repeat(MAX_SOURCE_CHARACTERS + 1000);
    const loaded = await readOk(file('long.mcl', text));
    expect(loaded.length).toBe(MAX_SOURCE_CHARACTERS + 1000); // never truncated
    const result = compile(loaded);
    expect(result.failedPhase).toBe('input');
    expect(result.diagnostics[0]).toMatchObject({ offset: MAX_SOURCE_CHARACTERS, column: MAX_SOURCE_CHARACTERS + 1 });
  });
});

describe('file names', () => {
  it.each([
    ['marks.mcl', 'marks.mcl'],
    ['C:\\Users\\me\\Desktop\\marks.mcl', 'marks.mcl'],
    ['folder/sub/prog.mcl', 'prog.mcl'],
    ['bad<:>name?.mcl', 'badname.mcl'],
    ['   ', 'untitled.mcl'],
    ['..', 'untitled.mcl'],
  ])('cleans %j to %j', (input, expected) => {
    expect(cleanFileName(input)).toBe(expected);
  });

  it.each([
    ['marks.mcl', 'marks.mcl'],
    ['Marks.MCL', 'Marks.MCL'],
    ['notes.txt', 'notes.mcl'],
    ['program', 'program.mcl'],
    ['archive.tar.gz', 'archive.tar.mcl'],
    ['.mcl', 'untitled.mcl'],
    ['precedence', 'precedence.mcl'],
  ])('download name for %j is %j', (input, expected) => {
    expect(toMclFileName(input)).toBe(expected);
  });
});

describe('downloading', () => {
  it('encodes the text as UTF-8 with LF newlines preserved', async () => {
    const text = 'let caf\u00e9 = 1;\nprint 2;\n';
    const blob = sourceBlob(text);
    expect(blob.type).toBe('text/plain;charset=utf-8');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(utf8(text));
    expect(await blob.text()).toBe(text);
  });

  /** A fake browser that records what startDownload did. */
  function fakeEnvironment(options: { clickThrows?: boolean } = {}) {
    const log: string[] = [];
    let blob: Blob | null = null;
    let pendingCleanup: (() => void) | null = null;
    const link: DownloadLink = {
      href: '', download: '', rel: '',
      click: () => { log.push(`click ${link.download} ${link.href}`); if (options.clickThrows) throw new Error('blocked'); },
      remove: () => log.push('remove link'),
    };
    const environment: DownloadEnvironment = {
      createObjectURL: (b) => { blob = b; log.push('create url'); return 'blob:fake-1'; },
      revokeObjectURL: (url) => log.push(`revoke ${url}`),
      createLink: () => link,
      attach: () => log.push('attach link'),
      later: (callback) => { pendingCleanup = callback; },
    };
    return { environment, log, blob: () => blob, runCleanup: () => pendingCleanup?.() };
  }

  it('starts a download with the given name and contents, then cleans up', async () => {
    const fake = fakeEnvironment();
    startDownload(MARKS, 'marks.mcl', fake.environment);
    expect(fake.log).toEqual(['create url', 'attach link', 'click marks.mcl blob:fake-1', 'remove link']);
    expect(await fake.blob()?.text()).toBe(MARKS);
    fake.runCleanup();
    expect(fake.log.at(-1)).toBe('revoke blob:fake-1');
  });

  it('still removes the link and releases the URL if the click fails', () => {
    const fake = fakeEnvironment({ clickThrows: true });
    expect(() => startDownload('print 1;', 'a.mcl', fake.environment)).toThrow('blocked');
    fake.runCleanup();
    expect(fake.log).toContain('remove link');
    expect(fake.log.at(-1)).toBe('revoke blob:fake-1');
  });
});

describe('source document: unsaved status versus revisions', () => {
  const start = (): SourceDocument => createDocument(MARKS, exampleOrigin);

  it('starts clean, at revision 0, with newlines normalized', () => {
    const doc = createDocument('print 1;\r\n', exampleOrigin);
    expect(doc).toMatchObject({ text: 'print 1;\n', baseline: 'print 1;\n', revision: 0, lastDownload: null });
    expect(saveStatus(doc)).toBe('clean');
  });

  it('marks an edit as unsaved and increases the revision', () => {
    const edited = editDocument(start(), MARKS + 'print 1;');
    expect(hasUnsavedChanges(edited)).toBe(true);
    expect(saveStatus(edited)).toBe('unsaved');
    expect(edited.revision).toBe(1);
  });

  it('clears unsaved status after Undo, but the old compilation stays stale', () => {
    const doc = start();
    const compiledRevision = doc.revision; // a compilation made now
    const edited = editDocument(doc, MARKS + ' ');
    const undone = editDocument(edited, MARKS);
    expect(hasUnsavedChanges(undone)).toBe(false); // same text as the baseline
    expect(undone.revision).not.toBe(compiledRevision); // but a different revision
    expect(undone.revision).toBe(2);
  });

  it('replaces atomically: new text, origin, and baseline, and a new revision even for identical text', () => {
    const doc = editDocument(start(), 'print 2;');
    const opened = replaceDocument(doc, MARKS, fileOrigin('marks.mcl'));
    expect(opened).toMatchObject({ text: MARKS, baseline: MARKS, revision: 2, origin: fileOrigin('marks.mcl'), lastDownload: null });
    const reopened = replaceDocument(opened, MARKS, fileOrigin('marks.mcl'));
    expect(reopened.text).toBe(opened.text);
    expect(reopened.revision).toBe(opened.revision + 1); // requires recompilation
    expect(saveStatus(reopened)).toBe('clean');
  });

  it('records a started download without changing text, revision, or baseline', () => {
    const edited = editDocument(start(), 'print 3;');
    const downloaded = noteDownloadStarted(edited, 'marks.mcl', 1_000);
    expect(downloaded).toMatchObject({ text: edited.text, revision: edited.revision, baseline: edited.baseline });
    expect(downloaded.lastDownload).toEqual({ fileName: 'marks.mcl', text: 'print 3;', startedAt: 1_000 });
    expect(hasUnsavedChanges(downloaded)).toBe(true); // a download is not a confirmed save
    expect(saveStatus(downloaded)).toBe('download-started');
    expect(saveStatus(editDocument(downloaded, 'print 4;'))).toBe('unsaved'); // changed since the download
  });

  it('keeps an unchanged compilation valid when its source is downloaded', () => {
    const doc = start();
    const compilation = { revision: doc.revision, result: compile(doc.text) };
    const downloaded = noteDownloadStarted(doc, 'marks.mcl', 0);
    expect(compilation.revision === downloaded.revision).toBe(true);
    expect(runnableProgram(compilation.result)).not.toBeNull();
    expect(saveStatus(downloaded)).toBe('clean');
  });

  it('names documents for display and download', () => {
    expect(documentLabel(start())).toBe('Untitled (example: Marks and bonus)');
    expect(suggestedFileName(start())).toBe('marks.mcl');
    const opened = replaceDocument(start(), MARKS, fileOrigin('notes.txt'));
    expect(documentLabel(opened)).toBe('notes.txt');
    expect(suggestedFileName(opened)).toBe('notes.mcl');
  });

  it('returns frozen documents', () => {
    expect(Object.isFrozen(start())).toBe(true);
    expect(Object.isFrozen(noteDownloadStarted(start(), 'a.mcl', 0).lastDownload)).toBe(true);
  });
});

describe('stale asynchronous reads', () => {
  /** A file whose read finishes only when the test says so. */
  function slowFile(name: string, text: string) {
    let finish: () => void = () => {};
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    const readable: ReadableFile = {
      name, size: text.length,
      arrayBuffer: async () => { await gate; return utf8(text).buffer; },
    };
    return { readable, finish };
  }

  /** The workbench's rule: start a ticket, read, and apply only if the ticket is still current. */
  function open(guard: LatestRequest, readable: ReadableFile, applied: string[]): Promise<void> {
    const ticket = guard.begin();
    return readSourceFile(readable).then((outcome) => {
      if (guard.isCurrent(ticket) && outcome.ok) applied.push(outcome.fileName);
    });
  }

  it('lets a newer selection win even when the older read finishes last', async () => {
    const guard = new LatestRequest();
    const applied: string[] = [];
    const older = slowFile('older.mcl', 'print 1;');
    const newer = slowFile('newer.mcl', 'print 2;');
    const first = open(guard, older.readable, applied);
    const second = open(guard, newer.readable, applied);
    newer.finish();
    await second;
    older.finish(); // the older read completes AFTER the newer one
    await first;
    expect(applied).toEqual(['newer.mcl']);
  });

  it('ignores a read that finishes after another replacement, such as Load Example', async () => {
    const guard = new LatestRequest();
    const applied: string[] = [];
    const slow = slowFile('slow.mcl', 'print 1;');
    const reading = open(guard, slow.readable, applied);
    guard.invalidate(); // an example was loaded meanwhile
    slow.finish();
    await reading;
    expect(applied).toEqual([]);
  });

  it('treats only the latest ticket as current', () => {
    const guard = new LatestRequest();
    const a = guard.begin();
    const b = guard.begin();
    expect([guard.isCurrent(a), guard.isCurrent(b)]).toEqual([false, true]);
    guard.invalidate();
    expect(guard.isCurrent(b)).toBe(false);
  });
});
