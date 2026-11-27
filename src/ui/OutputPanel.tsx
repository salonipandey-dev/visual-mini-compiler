/**
 * OutputPanel — what happened when the compiled instructions were RUN.
 * Compilation results live in the phase tabs; this panel is only about execution.
 */
import type { Diagnostic } from '../compiler';
import type { ExecutionResult } from '../runtime';

/** Everything the panel can show, derived by App from compilation and execution state. */
export type OutputState =
  | { readonly kind: 'not-compiled' }
  | { readonly kind: 'compile-failed'; readonly compilation: number }
  | { readonly kind: 'stale'; readonly compilation: number }
  | { readonly kind: 'ready'; readonly compilation: number; readonly instructionCount: number }
  | { readonly kind: 'ran'; readonly compilation: number; readonly run: number; readonly result: ExecutionResult }
  | { readonly kind: 'internal-error'; readonly compilation: number; readonly run: number };

interface Props {
  state: OutputState;
  onShowSource: (diagnostic: Diagnostic) => void;
}

export function OutputPanel({ state, onShowSource }: Props) {
  return (
    <section className="output" aria-labelledby="output-heading">
      <h2 id="output-heading" className="panel-heading">
        Output
        <StatusChip state={state} />
      </h2>
      <OutputBody state={state} onShowSource={onShowSource} />
    </section>
  );
}

function StatusChip({ state }: { state: OutputState }) {
  if (state.kind === 'ran' && state.result.status === 'success') {
    return <span className="count">Ran successfully</span>;
  }
  if (state.kind === 'ran') return <span className="count count-error">Runtime error</span>;
  if (state.kind === 'internal-error') return <span className="count count-error">Internal error</span>;
  return null;
}

function OutputBody({ state, onShowSource }: Props) {
  switch (state.kind) {
    case 'not-compiled':
      return <p className="output-note">Compile the program, then press Run to execute it. Output appears here.</p>;
    case 'compile-failed':
      return (
        <p className="output-note">
          Run is unavailable because compilation {state.compilation} failed. Fix the problems above
          and compile again.
        </p>
      );
    case 'stale':
      return (
        <p className="output-note">
          Run is unavailable because the source changed after compilation {state.compilation}. Compile
          again to run the current text.
        </p>
      );
    case 'ready':
      return (
        <p className="output-note">
          Compilation {state.compilation} is ready. Press Run to execute its{' '}
          {state.instructionCount === 1 ? '1 instruction' : `${state.instructionCount} instructions`}.
        </p>
      );
    case 'internal-error':
      return (
        <p className="output-status status-error">
          Run {state.run} could not finish because of an internal error in the workbench, not in your
          program. Technical details were written to the browser console. You can run again or
          recompile.
        </p>
      );
    case 'ran':
      return <RanBody state={state} onShowSource={onShowSource} />;
  }
}

function RanBody({
  state,
  onShowSource,
}: {
  state: Extract<OutputState, { kind: 'ran' }>;
  onShowSource: (diagnostic: Diagnostic) => void;
}) {
  const { result, run, compilation } = state;
  const count = result.lines.length;
  const printed = count === 1 ? '1 line' : `${count} lines`;

  if (result.status === 'success') {
    return (
      <>
        <p className="output-status status-success">
          Run {run} of compilation {compilation} finished successfully and printed {printed}.
        </p>
        {count === 0 ? (
          <p className="output-note">The program printed nothing.</p>
        ) : (
          <pre className="output-text" aria-label="Program output" tabIndex={0}>
            {result.lines.join('\n')}
          </pre>
        )}
      </>
    );
  }

  const d = result.diagnostic;
  return (
    <>
      <p className="output-status status-error">
        Run {run} of compilation {compilation} stopped with a runtime error
        {d && ` at line ${d.line}, column ${d.column}`}. Compilation itself succeeded.
      </p>
      {d && (
        <div className="runtime-diagnostic">
          <p className="problem-message">{d.message}</p>
          <button type="button" className="btn-link" onClick={() => onShowSource(d)}>
            Show in source
          </button>
        </div>
      )}
      <h3 className="output-subheading">Partial output (printed before the error)</h3>
      {count === 0 ? (
        <p className="output-note">Nothing was printed before the error.</p>
      ) : (
        <pre className="output-text is-partial" aria-label="Partial program output" tabIndex={0}>
          {result.lines.join('\n')}
        </pre>
      )}
    </>
  );
}
