# File workflow: Open, Download, and unsaved work

## What changed

The file bar above the editor shows the current file name, its save status, and
two actions, **Open .mcl** and **Download .mcl**. The logic lives in src/files/.
It does not depend on React, so Node tests cover it.

| File | Responsibility |
| --- | --- |
| src/files/document.ts | The source document: text, revision, baseline, origin, last download |
| src/files/sourceFile.ts | Reading a chosen file as UTF-8, and file names |
| src/files/download.ts | Starting a download and cleaning up afterwards |
| src/files/latestRequest.ts | Ignoring file reads that finish too late |
| src/ui/ReplaceDialog.tsx | The keep / download / replace decision |

## Two separate questions

| Question | Compared | Changes when |
| --- | --- | --- |
| Is the compilation current? | revision numbers | every edit, Undo, Open, or Load Example, even with identical text |
| Are there unsaved changes? | text against the baseline | the text stops or starts matching the baseline |

The baseline is the text of the last successful Open or Load Example.
Undo can make the text match the baseline again. That clears "Unsaved changes",
but the revision has still moved, so the old compilation stays stale and Run
stays disabled until you compile again.

## When the unsaved indicator clears

"Unsaved changes" clears only when the editor text equals the baseline. That happens:

- after a successful Open, where the baseline becomes the file's text;
- after Load Example, where the baseline becomes the example's text;
- when edits or Undo return the text to the baseline exactly.

Downloading never clears it. A page can ask the browser to download a file, but
it is never told whether the user saved it, where it went, or whether the write
succeeded. After a download of the current edited text, the status reads
"Unsaved: download started, not confirmed". Editing again changes it back to
"Unsaved changes".

## State transitions

~~~text
                  edit / Undo / paste
      +-------------------------------------------+
      |                                           v
  [document: text, revision, baseline]   revision + 1, baseline unchanged
      |
      | Open (file read succeeds) or Load Example
      v
  unsaved changes? --no--> replace now
      |
     yes
      v
  [Replace dialog]
      |-- Keep editing (or Escape)  -> nothing changes
      |-- Download a copy           -> download starts; dialog stays open; editor unchanged
      '-- Replace without downloading / Replace source -> replace now

  replace now = new text, new origin and file name, baseline = new text,
                revision + 1, compilation cleared, output cleared,
                selections cleared, any read still in progress ignored
~~~

A canceled file selection, a read error, a file that is not UTF-8, or a file
that is too large changes nothing: the text, file name, compilation, Run
availability, and output all stay as they were. Only a message is shown.

## Opening a file

1. **Open .mcl** clicks a hidden file input with accept=".mcl,text/plain". The
   browser shows its normal file picker. Other files can still be chosen through
   the picker's "All files" option.
2. The input's value is cleared straight away, so choosing the same file again
   still produces a change event.
3. The file is read with Blob.arrayBuffer() and decoded with
   TextDecoder('utf-8', { fatal: true }):
   - Invalid UTF-8 is an error. It is never replaced with U+FFFD.
   - A leading UTF-8 byte-order mark is removed.
   - CRLF and lone CR become LF.
4. Files over 1 MB are refused before reading. Smaller files are never
   truncated. Text over the 5,000-character language limit loads in full, and
   Compile reports the limit, just as for typed text.
5. Language errors do not block loading; Compile reports them with positions.
6. Only after the read succeeds does the unsaved-work decision happen, against
   the document as it is at that moment.

### Reads that finish late

Reading is asynchronous. Each Open takes a ticket from LatestRequest. Starting
another Open, choosing an example (even if the example then waits in the Replace
dialog, or you keep editing), or applying any replacement makes older tickets
stale. A read whose ticket is stale is ignored when it finishes, so a slow older
file can never replace a newer choice or change a pending decision.

If you type while a file is being read, the read still finishes. But the
document now has unsaved edits, so the Replace dialog asks before anything is
replaced.

## Downloading

1. The current editor text becomes a Blob of type text/plain;charset=utf-8.
   That is UTF-8 with LF newlines, exactly as in the editor.
2. A temporary object URL and a hidden <a download> link are created, the link
   is clicked, and the link is removed. The object URL is released one second
   later; some browsers read it just after the click.
3. The suggested name is the opened file's name with a .mcl extension
   (notes.txt becomes notes.mcl), or the example's id, such as precedence.mcl.
   The browser may change it, for example to marks (1).mcl if a file of that
   name already exists.
4. The message says the download started and that the page cannot confirm the
   file was written.

Downloading does not change the text or its revision, so a current compilation
stays valid and Run stays available.

This uses the long-supported Blob, object URL, and download-attribute technique.
The File System Access API (showSaveFilePicker) is not used. It is not
available in every browser, and it would change what "saved" means.

## Leaving the page

While there are unsaved changes, a beforeunload handler asks the browser to warn
before reload or close. This is best effort:

- browsers show their own generic text;
- some show it only after the user has interacted with the page;
- mobile browsers may not show it at all.

There is no warning when the text matches the baseline.

## Browser memory

Nothing is stored by the page. There is no localStorage, cookie, or server.
Source, compilation, and output live only in the tab's memory. They are lost on
reload, on close, or if the browser discards the tab. A file on disk changes only
when the user saves a download.

## Testing notes

Node tests in tests/files.test.ts cover reading, names, downloading with a fake
browser, document transitions, and stale reads. Chromium tests in
tests/browser/file-workflow.spec.ts cover the full workflow through the real
file chooser and downloads.

Some behaviour automation cannot show. Playwright's file chooser always fires
a change event, so it cannot reproduce a real picker ignoring a reselected file.
The real save dialog and the files on disk are also outside its reach. These are
listed as manual checks in acceptance-checklist.md.
