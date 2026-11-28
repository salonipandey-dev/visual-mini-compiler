/**
 * App — owns the state and connects the UI to the compiler core.
 *
 *   editor text ──(Compile)──► compile(source) ──► CompileResult ──► phase tabs, problems
 *                 ──(Run)──────► execute(instructions) ──► ExecutionResult ──► Output panel
 *
 * Compiling never runs the program. Run executes the instructions of the latest
 * compilation, and only when that compilation succeeded AND was made from the
 * editor's current revision (so an edit, even followed by Undo, requires recompiling).
 *
 * Source text lives in a SourceDocument (src/files): its revision decides whether a
 * compilation is current; its baseline decides whether there are unsaved changes.
 * Open and Load Example replace the document atomically, after any unsaved-work
 * decision. Download hands the text to the browser and never counts as a save.
 *
 * All state lives in memory. Nothing is sent anywhere or stored by the page;
 * refreshing restores the default example (after a best-effort unsaved warning).
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { compile, PHASES, type CompileResult, type Diagnostic, type PhaseId } from './compiler';
import { DEFAULT_EXAMPLE, EXAMPLES, type Example } from './examples/examples';
import {
  cleanFileName, createDocument, documentLabel, editDocument, hasUnsavedChanges, LatestRequest,
  noteDownloadStarted, readSourceFile, replaceDocument, saveStatus, startDownload, suggestedFileName,
  type SourceOrigin,
} from './files';
import { ReplaceDialog } from './ui/ReplaceDialog';
import { execute, runnableProgram, type ExecutionResult } from './runtime';
import { LexicalView } from './ui/LexicalView';
import { OutputPanel, type OutputState } from './ui/OutputPanel';
import { reportInternalError } from './ui/internalError';
import { SyntaxView } from './ui/SyntaxView';
import { SemanticView } from './ui/SemanticView';
import { IntermediateView, sourceOf } from './ui/IntermediateView';
import { PhaseMessage } from './ui/PhaseMessage';
import { PhasePipeline } from './ui/PhasePipeline';
import { ProblemsPanel } from './ui/ProblemsPanel';
import { LINE_HEIGHT, SourceEditor, type Highlight } from './ui/SourceEditor';

interface Compilation {
  revision: number;
  number: number;
  ms: number;
  result: CompileResult;
}

/** One press of Run. Kept apart from the compilation it executed. */
type Execution =
  | { kind: 'ran'; compilation: number; run: number; result: ExecutionResult }
  | { kind: 'internal-error'; compilation: number; run: number };

/** Text that Open or Load Example wants to put in the editor. */
interface Replacement {
  origin: SourceOrigin;
  text: string;
  /** For messages: "Opening scores.mcl" or "Loading the example ..." */
  action: string;
}

/** A replacement waiting for the user's decision about unsaved changes. */
interface PendingReplacement {
  replacement: Replacement;
  downloadedName: string | null;
}

type FileNotice = { kind: 'info' | 'error'; message: string };

const exampleOrigin = (example: Example): SourceOrigin => ({ kind: 'example', exampleId: example.id, title: example.title });

export default function App() {
  const [doc, setDoc] = useState(() => createDocument(DEFAULT_EXAMPLE.source, exampleOrigin(DEFAULT_EXAMPLE)));
  const [pending, setPending] = useState<PendingReplacement | null>(null);
  const [fileNotice, setFileNotice] = useState<FileNotice | null>(null);
  const [compilation, setCompilation] = useState<Compilation | null>(null);
  const [activePhase, setActivePhase] = useState<PhaseId>('lexical');
  const [picked, setPicked] = useState<Highlight | null>(null); // token or problem the user selected
  const [pickedToken, setPickedToken] = useState<number | null>(null);
  const [pickedSymbol, setPickedSymbol] = useState<number | null>(null);
  const [pickedInstruction, setPickedInstruction] = useState<number | null>(null);
  const [execution, setExecution] = useState<Execution | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const compileCounter = useRef(0);
  const reads = useRef(new LatestRequest());
  // File reads finish asynchronously: they must compare against the document as it is THEN.
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const source = doc.text;
  const sourceRevision = doc.revision;
  const unsaved = hasUnsavedChanges(doc);

  // Best-effort warning before reload or close while there are unsaved changes.
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = ''; // older browsers need this to show the prompt
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  const result = compilation?.result ?? null;
  // Any edit invalidates results, including an edit followed by Undo.
  const stale = compilation !== null && compilation.revision !== sourceRevision;
  // The program Run would execute: only a fully successful, current compilation has one.
  const runnable = compilation !== null && !stale ? runnableProgram(compilation.result) : null;

  function changeSource(value: string) {
    setDoc((current) => editDocument(current, value)); // normalizes newlines, revision + 1
    setExecution(null); // output belonged to the old text
    clearPicks();
  }

  function clearPicks() {
    setPicked(null);
    setPickedToken(null);
    setPickedSymbol(null);
    setPickedInstruction(null);
  }

  function handleCompile() {
    const started = performance.now();
    const next = compile(source); // the ONLY place the UI calls the compiler
    const ms = performance.now() - started;

    compileCounter.current += 1;
    // Replace everything from the previous compilation: no old tokens or errors survive.
    setCompilation({ revision: sourceRevision, number: compileCounter.current, ms, result: next });
    setExecution(null); // compiling never runs the program, and old output is obsolete
    clearPicks();
    if (next.failedPhase) setActivePhase(next.failedPhase === 'input' ? 'lexical' : next.failedPhase);
    setAnnouncement(describeCompilation(compileCounter.current, next));
  }

  function handleRun() {
    // Checked here as well as by the disabled button: never run stale or failed compilations.
    if (!compilation || compilation.revision !== sourceRevision) {
      setAnnouncement('Run is unavailable: compile the current source first.');
      return;
    }
    const program = runnableProgram(compilation.result);
    if (!program) {
      setAnnouncement('Run is unavailable because compilation failed.');
      return;
    }
    const runNumber = execution && execution.compilation === compilation.number ? execution.run + 1 : 1;
    clearPicks();
    try {
      const result = execute(program); // fresh variables, temporaries, and output every time
      setExecution({ kind: 'ran', compilation: compilation.number, run: runNumber, result });
      setAnnouncement(describeExecution(runNumber, result));
    } catch (error) {
      reportInternalError('the runner', error);
      setExecution({ kind: 'internal-error', compilation: compilation.number, run: runNumber });
      setAnnouncement(`Run ${runNumber} failed because of an internal error in the workbench, not in your program.`);
    }
  }

  function loadExample(id: string) {
    const example = EXAMPLES.find((e) => e.id === id);
    if (!example) return;
    requestReplacement({
      origin: exampleOrigin(example),
      text: example.source,
      action: `Loading the example "${example.title}"`,
    });
  }

  /** Replace now if nothing would be lost; otherwise ask first. */
  function requestReplacement(replacement: Replacement) {
    if (hasUnsavedChanges(docRef.current)) {
      setPending({ replacement, downloadedName: null });
      return;
    }
    applyReplacement(replacement);
  }

  /** Swap in new source atomically and invalidate everything that belonged to the old text. */
  function applyReplacement({ origin, text }: Replacement) {
    reads.current.invalidate(); // a read still in flight must not overwrite this
    setDoc((current) => replaceDocument(current, text, origin)); // revision + 1 even for identical text
    setPending(null);
    setCompilation(null);
    setExecution(null);
    clearPicks();
    setActivePhase('lexical');
    setFileNotice(null);
    setAnnouncement(
      origin.kind === 'file'
        ? `Opened ${origin.fileName}. Press Compile to analyze it.`
        : `Loaded example: ${origin.title}. Press Compile to analyze it.`,
    );
    editorRef.current?.focus();
  }

  function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = ''; // so choosing the same file again still fires a change event
    if (!file) return; // selection canceled: nothing changes

    const ticket = reads.current.begin(); // any older read is now stale
    const name = cleanFileName(file.name);
    setFileNotice({ kind: 'info', message: `Opening ${name}…` });
    readSourceFile(file)
      .then((outcome) => {
        if (!reads.current.isCurrent(ticket)) return; // superseded by a newer Open or a load
        if (!outcome.ok) {
          setFileNotice({ kind: 'error', message: outcome.message });
          setAnnouncement(outcome.message);
          return; // editor, compilation, and output are untouched
        }
        setFileNotice(null);
        requestReplacement({ origin: { kind: 'file', fileName: outcome.fileName }, text: outcome.text, action: `Opening ${outcome.fileName}` });
      })
      .catch((error: unknown) => {
        if (!reads.current.isCurrent(ticket)) return;
        reportInternalError('opening a file', error);
        setFileNotice({ kind: 'error', message: `Could not open ${name} because of an internal error. The editor was not changed.` });
      });
  }

  /** Offer the current text as a download. Changes nothing else: not the text, revision, or baseline. */
  function downloadSource(): string | null {
    const current = docRef.current;
    const fileName = suggestedFileName(current);
    try {
      startDownload(current.text, fileName);
    } catch (error) {
      reportInternalError('starting a download', error);
      setFileNotice({ kind: 'error', message: 'The browser could not start the download. The editor was not changed.' });
      return null;
    }
    setDoc((latest) => noteDownloadStarted(latest, fileName, Date.now()));
    const message = `Download of ${fileName} started. Your browser decides where it is saved; this page cannot confirm that the file was written.`;
    setFileNotice({ kind: 'info', message });
    setAnnouncement(message);
    return fileName;
  }

  function keepEditing() {
    setPending(null);
    setAnnouncement('Kept the current source. Nothing was replaced.');
    editorRef.current?.focus();
  }

  /** Scroll the editor so a source offset is visible; optionally select it and move focus there. */
  function revealInEditor(offset: number, length: number, moveFocus: boolean) {
    const ta = editorRef.current;
    if (!ta) return;
    const line = source.slice(0, offset).split('\n').length;
    const top = (line - 1) * LINE_HEIGHT;
    if (top < ta.scrollTop || top > ta.scrollTop + ta.clientHeight - 2 * LINE_HEIGHT) {
      ta.scrollTop = Math.max(0, top - ta.clientHeight / 3);
    }
    if (moveFocus) {
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(offset, offset + length);
    }
  }

  function pickToken(index: number) {
    const token = result?.phases.lexical.output?.[index];
    if (!token || stale) return;
    clearPicks();
    setPickedToken(index);
    setPicked({
      offset: token.offset,
      length: token.lexeme.length,
      kind: token.type === 'ERROR' ? 'focus-error' : 'token',
    });
    revealInEditor(token.offset, token.lexeme.length, false);
  }

  function pickSymbol(index: number) {
    const symbol = result?.phases.semantic.output?.symbols[index];
    if (!symbol || stale) return;
    const at = symbol.declaredAt;
    clearPicks();
    setPickedSymbol(index);
    setPicked({ offset: at.offset, length: at.length, kind: 'token' });
    revealInEditor(at.offset, at.length, false);
  }

  function pickInstruction(index: number) {
    const instruction = result?.phases.intermediate.output?.instructions[index];
    if (!instruction || stale) return;
    const at = sourceOf(instruction);
    clearPicks();
    setPickedInstruction(index);
    setPicked({ offset: at.offset, length: at.length, kind: 'token' });
    revealInEditor(at.offset, at.length, false);
  }

  function jumpToProblem(d: Diagnostic) {
    if (stale) return;
    clearPicks();
    setPicked({ offset: d.offset, length: d.length, kind: 'focus-error' });
    revealInEditor(d.offset, d.length, true);
  }

  // Highlights are only drawn while the results still match the text.
  const highlights = useMemo<Highlight[]>(() => {
    if (!result || stale) return [];
    const errors: Highlight[] = allDiagnostics(result, execution).map((d) => ({
      offset: d.offset,
      length: d.length,
      kind: 'error',
    }));
    return picked ? [picked, ...errors] : errors;
  }, [result, stale, picked, execution]);

  const errorLines = useMemo(
    () => new Set(result && !stale ? allDiagnostics(result, execution).map((d) => d.line) : []),
    [result, stale, execution],
  );

  const outputState: OutputState = !compilation
    ? { kind: 'not-compiled' }
    : stale
      ? { kind: 'stale', compilation: compilation.number }
      : !runnable
        ? { kind: 'compile-failed', compilation: compilation.number }
        : execution && execution.compilation === compilation.number
          ? execution
          : { kind: 'ready', compilation: compilation.number, instructionCount: runnable.instructions.length };

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) handleRun();
      else handleCompile();
    }
  }

  return (
    <div className="app" onKeyDown={onKeyDown}>
      <header className="app-header">
        <h1>Visual Mini Compiler</h1>
        <p className="run-info" aria-hidden="true">
          {compilation ? `Compilation ${compilation.number} finished in ${compilation.ms.toFixed(1)} ms` : 'Not compiled yet'}
        </p>
      </header>

      {stale && compilation && (
        <p className="stale-banner" role="status">
          You edited the program after compilation {compilation.number}. The results below are for the old text.
          Compile again to refresh them.
        </p>
      )}

      <main className="workbench">
        <section className="pane pane-source" aria-labelledby="source-heading">
          <div className="pane-toolbar">
            <h2 id="source-heading" className="panel-heading">
              Source
            </h2>
            <label className="example-picker">
              <span className="sr-only">Load an example program</span>
              <select value="" onChange={(e) => loadExample(e.target.value)}>
                <option value="" disabled>
                  Load an example…
                </option>
                <optgroup label="Valid programs">
                  {EXAMPLES.filter((e) => e.kind === 'valid').map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Programs with errors">
                  {EXAMPLES.filter((e) => e.kind === 'invalid').map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <button type="button" className="btn-compile" onClick={handleCompile}>
              Compile
            </button>
            <button
              type="button"
              className="btn-run"
              onClick={handleRun}
              disabled={runnable === null}
              title={runnable === null ? 'Compile the current source successfully to enable Run' : 'Execute the compiled instructions'}
            >
              Run
            </button>
          </div>

          <div className="file-bar">
            <span className="file-name" title={documentLabel(doc)}>
              {documentLabel(doc)}
            </span>
            <span className={`save-status save-${saveStatus(doc)}`} data-testid="save-status">
              {SAVE_STATUS_TEXT[saveStatus(doc)]}
            </span>
            <span className="file-actions">
              <button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
                Open .mcl
              </button>
              <button type="button" className="btn-secondary" onClick={() => downloadSource()}>
                Download .mcl
              </button>
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mcl,text/plain"
              hidden
              onChange={onFileChosen}
              aria-label="Choose a .mcl file to open"
            />
          </div>
          {fileNotice && (
            <p className={`file-notice notice-${fileNotice.kind}`} role={fileNotice.kind === 'error' ? 'alert' : 'status'}>
              {fileNotice.message}
            </p>
          )}

          <SourceEditor
            value={source}
            onChange={changeSource}
            highlights={highlights}
            errorLines={errorLines}
            textareaRef={editorRef}
          />

          <ProblemsPanel result={result} stale={stale} onJump={jumpToProblem} />
          <OutputPanel state={outputState} onShowSource={jumpToProblem} />
        </section>

        <section className={`pane pane-results${stale ? ' is-stale' : ''}`} aria-label="Phase results">
          <PhasePipeline result={result} active={activePhase} onSelect={setActivePhase} />
          <div
            className="phase-panel"
            role="tabpanel"
            id={`panel-${activePhase}`}
            aria-labelledby={`tab-${activePhase}`}
          >
            {renderPhase()}
          </div>
        </section>
      </main>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {pending && (
        <ReplaceDialog
          currentLabel={documentLabel(doc)}
          action={pending.replacement.action}
          earlierDownload={
            doc.lastDownload && doc.lastDownload.text === doc.text
              ? { fileName: doc.lastDownload.fileName, time: new Date(doc.lastDownload.startedAt).toLocaleTimeString() }
              : null
          }
          downloadedName={pending.downloadedName}
          onKeep={keepEditing}
          onDownload={() => {
            const fileName = downloadSource();
            if (fileName) setPending((current) => current && { ...current, downloadedName: fileName });
          }}
          onReplace={() => applyReplacement(pending.replacement)}
        />
      )}
    </div>
  );

  function renderPhase() {
    if (!result) {
      return (
        <PhaseMessage tone="idle" title="Nothing compiled yet">
          <p>
            Write a program on the left or load an example, then press Compile. Each phase shows the
            output it actually produced from your source.
          </p>
        </PhaseMessage>
      );
    }

    const phase = result.phases[activePhase];
    const title = PHASES.find((p) => p.id === activePhase)?.title ?? activePhase;

    if (activePhase === 'lexical' && phase.status !== 'skipped') {
      const lexical = result.phases.lexical;
      return (
        <LexicalView
          tokens={lexical.output ?? []}
          status={lexical.status}
          errorCount={lexical.diagnostics.length}
          selectedIndex={pickedToken}
          onSelect={pickToken}
        />
      );
    }

    if (activePhase === 'syntax' && result.phases.syntax.status === 'success' && result.phases.syntax.output) {
      return <SyntaxView program={result.phases.syntax.output} />;
    }

    const semantic = result.phases.semantic;
    if (activePhase === 'semantic' && semantic.output && (semantic.status === 'success' || semantic.status === 'error')) {
      return (
        <SemanticView
          table={semantic.output}
          status={semantic.status}
          diagnostics={semantic.diagnostics}
          stale={stale}
          selectedIndex={pickedSymbol}
          onSelect={pickSymbol}
        />
      );
    }

    const intermediate = result.phases.intermediate;
    if (activePhase === 'intermediate' && intermediate.status === 'success' && intermediate.output) {
      return (
        <IntermediateView
          program={intermediate.output}
          stale={stale}
          selectedIndex={pickedInstruction}
          onSelect={pickInstruction}
        />
      );
    }

    if (phase.status === 'error') {
      return (
        <PhaseMessage tone="error" title={title + ' failed'}>
          <p>Fix the problem shown under the source editor, then compile again.</p>
        </PhaseMessage>
      );
    }

    if (phase.status === 'skipped') {
      return (
        <PhaseMessage tone="skipped" title={`${title} was skipped`}>
          <p>{phase.note}</p>
          <p>Fix the errors listed under Problems, then compile again.</p>
        </PhaseMessage>
      );
    }

    return (
      <PhaseMessage tone="pending" title={`${title} is not built yet`}>
        <p>{phase.note}</p>
      </PhaseMessage>
    );
  }
}

const SAVE_STATUS_TEXT = {
  clean: 'No unsaved changes',
  unsaved: 'Unsaved changes',
  'download-started': 'Unsaved: download started, not confirmed',
} as const;

/** Compile diagnostics plus, when the last run failed, its runtime diagnostic. */
function allDiagnostics(result: CompileResult, execution: Execution | null): readonly Diagnostic[] {
  const runtime = execution?.kind === 'ran' ? execution.result.diagnostic : null;
  return runtime ? [...result.diagnostics, runtime] : result.diagnostics;
}

function describeExecution(run: number, result: ExecutionResult): string {
  const printed = plural(result.lines.length, 'line');
  if (result.status === 'success') {
    const shown = result.lines.length > 0 && result.lines.length <= 5 ? ` Output: ${result.lines.join(', ')}.` : '';
    return `Run ${run} finished successfully and printed ${printed}.${shown}`;
  }
  const d = result.diagnostic;
  const where = d ? ` at line ${d.line}, column ${d.column}` : '';
  return `Run ${run} stopped with a runtime error${where}. ${printed} printed before the error.`;
}

function describeCompilation(n: number, r: CompileResult): string {
  if (r.failedPhase) {
    const first = r.diagnostics[0];
    const count = r.diagnostics.length === 1 ? '1 error' : `${r.diagnostics.length} errors`;
    return `Compilation ${n}: ${r.failedPhase} analysis failed with ${count}. First error at line ${first.line}, column ${first.column}.`;
  }
  const tokens = r.phases.lexical.output?.length ?? 0;
  const symbols = r.phases.semantic.output?.symbols.length ?? 0;
  const instructions = r.phases.intermediate.output?.instructions.length ?? 0;
  return `Compilation ${n}: all phases passed with ${plural(tokens, 'token')}, ${plural(symbols, 'symbol')}, and ${plural(instructions, 'generated instruction')}. The program was compiled, not run. Press Run to execute it.`;
}

function plural(n: number, word: string): string {
  return n === 1 ? `1 ${word}` : `${n} ${word}s`;
}
