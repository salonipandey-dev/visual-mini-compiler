# Manual acceptance checklist: file workflow (checkpoint 6)

Statuses record only checks actually performed.

- **Automated:** passed in the listed Playwright test, headless Chromium, in the
  developer session on 28 November 2026. The pull request's CI run repeats these.
- **Pending:** not yet checked by a person in a real browser. Fill in the result,
  browser, and date when done.

| # | Check | How | Status |
| --- | --- | --- | --- |
| 1 | Open a .mcl file; its name and "No unsaved changes" appear; CRLF becomes LF | file-workflow.spec.ts: complete workflow | Automated |
| 2 | Compile the opened file; Lexical, Semantic, and Intermediate show results | complete workflow | Automated |
| 3 | Run prints 75 for the marks program | complete workflow | Automated |
| 4 | Editing shows "Unsaved changes" and disables Run | complete workflow | Automated |
| 5 | Load Example over edits shows Keep editing / Download a copy / Replace without downloading | complete workflow | Automated |
| 6 | Download a copy keeps the dialog and editor; the downloaded file has the edited text | complete workflow | Automated |
| 7 | Compile and Run again after keeping the edits | complete workflow | Automated |
| 8 | Escape in the dialog keeps editing | Escape test | Automated |
| 9 | Canceling the file picker changes nothing | cancel test | Automated |
| 10 | A non-UTF-8 file is rejected; work and output are preserved | not-UTF-8 test | Automated |
| 11 | A file with language errors loads; Compile reports them | language-errors test | Automated |
| 12 | A file over 5,000 characters loads untruncated; Compile reports the limit | 5,000-character test | Automated |
| 13 | Reopening the identical file requires recompiling | reopen test | Automated (Playwright always fires change; see row 20) |
| 14 | Downloading unchanged source keeps Run available | download-unchanged test | Automated |
| 15 | Undo clears "Unsaved changes" but Run stays disabled | Undo test | Automated |
| 16 | A slow older read cannot overwrite a newer selection or newer edits | slow-read test | Automated |
| 17 | Reload/close warns only while there are unsaved changes | beforeunload test | Automated |
| 18 | On Windows, the downloaded .mcl file appears in Downloads with the expected name and contents | Chrome or Edge on Windows; open the file in Notepad | Pending |
| 19 | Canceling the browser's save dialog (if "Ask where to save" is on) leaves the status "Unsaved: download started, not confirmed" | Chrome setting: Ask where to save each file | Pending |
| 20 | Choosing the same file twice in a real file picker reopens it | Real Chrome/Edge/Firefox picker | Pending |
| 21 | A file saved in Windows Notepad with CRLF opens with correct line numbers | Notepad, then Open .mcl | Pending |
| 22 | The reload warning appears in a real desktop browser after editing | Edit, then press F5 | Pending |
| 23 | Keyboard only: reach Open, Download, and every dialog button with Tab; focus returns to the editor | Keyboard, no mouse | Pending |
| 24 | Firefox: Open, Download, and the dialog work and look correct | Firefox desktop | Pending |
| 25 | Screen reader announces file open, download started, and dialog text | NVDA or Narrator | Pending |
