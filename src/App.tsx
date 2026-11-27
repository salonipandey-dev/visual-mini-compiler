/**
 * App — owns the state and connects the UI to the compiler core.
 *
 *   editor text ──(Compile)──► compile(source) ──► CompileResult ──► stepper, panels, problems
 *
 * All state lives in memory. Nothing is saved or sent anywhere; refreshing the
 * page restores the default example and clears the results.
 */
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { compile, normalizeSource, PHASES, type CompileResult, type Diagnostic, type PhaseId } from './compiler';
import { DEFAULT_EXAMPLE, EXAMPLES } from './examples/examples';
import { LexicalView } from './ui/LexicalView';
import { SyntaxView } from './ui/SyntaxView';
import { PhaseMessage } from './ui/PhaseMessage';
import { PhasePipeline } from './ui/PhasePipeline';
import { ProblemsPanel } from './ui/ProblemsPanel';
import { LINE_HEIGHT, SourceEditor, type Highlight } from './ui/SourceEditor';

interface Run {
  revision: number;
  number: number;
  ms: number;
  result: CompileResult;
}

export default function App() {
  const [source, setSource] = useState(DEFAULT_EXAMPLE.source);
  const [sourceRevision, setSourceRevision] = useState(0);
  const [run, setRun] = useState<Run | null>(null);
  const [activePhase, setActivePhase] = useState<PhaseId>('lexical');
  const [picked, setPicked] = useState<Highlight | null>(null); // token or problem the user selected
  const [pickedToken, setPickedToken] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const runCounter = useRef(0);

  const result = run?.result ?? null;
  // Any edit invalidates results, including an edit followed by Undo.
  const stale = run !== null && run.revision !== sourceRevision;

  function changeSource(value: string) {
    setSource(normalizeSource(value));
    setSourceRevision((revision) => revision + 1);
    setPicked(null);
    setPickedToken(null);
  }

  function handleCompile() {
    const started = performance.now();
    const next = compile(source); // the ONLY place the UI calls the compiler
    const ms = performance.now() - started;

    runCounter.current += 1;
    // Replace everything from the previous run: no old tokens or errors survive.
    setRun({ revision: sourceRevision, number: runCounter.current, ms, result: next });
    setPicked(null);
    setPickedToken(null);
    if (next.failedPhase) setActivePhase(next.failedPhase === 'input' ? 'lexical' : next.failedPhase);
    setAnnouncement(describeRun(runCounter.current, next));
  }

  function loadExample(id: string) {
    const example = EXAMPLES.find((e) => e.id === id);
    if (!example) return;
    changeSource(example.source);
    setRun(null); // old results belong to different source text
    setPicked(null);
    setPickedToken(null);
    setActivePhase('lexical');
    setAnnouncement(`Loaded example: ${example.title}. Press Compile to analyze it.`);
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
    setPickedToken(index);
    setPicked({
      offset: token.offset,
      length: token.lexeme.length,
      kind: token.type === 'ERROR' ? 'focus-error' : 'token',
    });
    revealInEditor(token.offset, token.lexeme.length, false);
  }

  function jumpToProblem(d: Diagnostic) {
    if (stale) return;
    setPickedToken(null);
    setPicked({ offset: d.offset, length: d.length, kind: 'focus-error' });
    revealInEditor(d.offset, d.length, true);
  }

  // Highlights are only drawn while the results still match the text.
  const highlights = useMemo<Highlight[]>(() => {
    if (!result || stale) return [];
    const errors: Highlight[] = result.diagnostics.map((d) => ({
      offset: d.offset,
      length: d.length,
      kind: 'error',
    }));
    return picked ? [picked, ...errors] : errors;
  }, [result, stale, picked]);

  const errorLines = useMemo(
    () => new Set(result && !stale ? result.diagnostics.map((d) => d.line) : []),
    [result, stale],
  );

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleCompile();
    }
  }

  return (
    <div className="app" onKeyDown={onKeyDown}>
      <header className="app-header">
        <h1>Visual Mini Compiler</h1>
        <p className="run-info" aria-hidden="true">
          {run ? `Compilation ${run.number} finished in ${run.ms.toFixed(1)} ms` : 'Not compiled yet'}
        </p>
      </header>

      {stale && run && (
        <p className="stale-banner" role="status">
          You edited the program after compilation {run.number}. The results below are for the old text.
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
          </div>

          <SourceEditor
            value={source}
            onChange={changeSource}
            highlights={highlights}
            errorLines={errorLines}
            textareaRef={editorRef}
          />

          <ProblemsPanel result={result} stale={stale} onJump={jumpToProblem} />
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
        <p>The Syntax tab shows the abstract syntax tree produced by the completed parser.</p>
      </PhaseMessage>
    );
  }
}

function describeRun(n: number, r: CompileResult): string {
  if (r.failedPhase) {
    const first = r.diagnostics[0];
    const count = r.diagnostics.length === 1 ? '1 error' : `${r.diagnostics.length} errors`;
    return `Compilation ${n}: ${r.failedPhase} analysis failed with ${count}. First error at line ${first.line}, column ${first.column}.`;
  }
  const tokens = r.phases.lexical.output?.length ?? 0;
  return `Compilation ${n}: lexical and syntax analysis passed with ${tokens === 1 ? '1 token' : `${tokens} tokens`}.`;
}
