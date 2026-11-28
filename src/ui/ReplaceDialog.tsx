/**
 * ReplaceDialog — asked before Open or Load Example would replace edited source.
 *
 * Three choices: keep editing, download a copy, or replace. Downloading a copy
 * keeps the dialog open and the editor unchanged: the user must still choose
 * explicitly, because starting a download does not prove the file was saved.
 */
import { useEffect, useRef } from 'react';

export interface ReplaceDialogProps {
  /** What the editor currently holds, e.g. "marks.mcl" or "Untitled (example: ...)". */
  currentLabel: string;
  /** What would replace it, e.g. "Opening scores.mcl". */
  action: string;
  /** A download of the CURRENT text was started earlier (before this dialog), if any. */
  earlierDownload: { fileName: string; time: string } | null;
  /** Set once the user chose "Download a copy" in this dialog. */
  downloadedName: string | null;
  onKeep: () => void;
  onDownload: () => void;
  onReplace: () => void;
}

export function ReplaceDialog({
  currentLabel, action, earlierDownload, downloadedName, onKeep, onDownload, onReplace,
}: ReplaceDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    // showModal traps focus and makes the rest of the page inert; fall back to a plain open dialog.
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }, []);

  return (
    <dialog
      ref={ref}
      className="replace-dialog"
      aria-labelledby="replace-title"
      aria-describedby="replace-description"
      onCancel={(event) => {
        event.preventDefault(); // Escape means "keep editing"
        onKeep();
      }}
    >
      <h2 id="replace-title">Replace the edited source?</h2>
      <p id="replace-description">
        The editor has changes that are not in {currentLabel}. {action} will replace the whole
        editor and discard those changes.
      </p>
      {earlierDownload && !downloadedName && (
        <p className="dialog-note">
          A download of this exact text ({earlierDownload.fileName}) was started at {earlierDownload.time}, but
          the browser cannot confirm that it was saved.
        </p>
      )}
      {downloadedName && (
        <p className="dialog-note" role="status">
          Download of {downloadedName} started. Check that the file was saved, then choose how to
          continue. The editor has not been changed.
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn-secondary" onClick={onKeep} autoFocus>
          Keep editing
        </button>
        <button type="button" className="btn-secondary" onClick={onDownload}>
          Download a copy
        </button>
        <button type="button" className="btn-danger" onClick={onReplace}>
          {downloadedName ? 'Replace source' : 'Replace without downloading'}
        </button>
      </div>
    </dialog>
  );
}
