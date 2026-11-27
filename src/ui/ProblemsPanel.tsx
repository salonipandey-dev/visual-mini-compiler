/**
 * ProblemsPanel — every Diagnostic from the last compile, from any phase.
 * Choosing one selects the offending text in the editor so you can fix it.
 */
import { PHASES, type CompileResult, type Diagnostic } from '../compiler';

interface Props {
  result: CompileResult | null;
  stale: boolean;
  onJump: (d: Diagnostic) => void;
}

const PHASE_NAME: Record<string, string> = { input: 'Input', ...Object.fromEntries(PHASES.map((p) => [p.id, p.title.split(' ')[0]])) };

export function ProblemsPanel({ result, stale, onJump }: Props) {
  const list = result?.diagnostics ?? [];

  return (
    <section className={`problems${stale ? ' is-stale' : ''}`} aria-labelledby="problems-heading">
      <h2 id="problems-heading" className="panel-heading">
        Problems
        {result && <span className={list.length ? 'count count-error' : 'count'}>{list.length}</span>}
      </h2>

      {!result && <p className="problems-empty">Errors from every phase are listed here after you compile.</p>}
      {result && list.length === 0 && (
        <p className="problems-empty">No problems. Every phase accepted this program and generated its instructions. Compiling does not run it: use Run.</p>
      )}

      {list.length > 0 && (
        <ol className="problem-list">
          {list.map((d, i) => (
            <li key={i}>
              <button type="button" className="problem" onClick={() => onJump(d)} disabled={stale}>
                <span className="problem-where">
                  Line {d.line}, column {d.column}
                </span>
                <span className="problem-phase">{PHASE_NAME[d.phase]}</span>
                <span className="problem-message">{d.message}</span>
                {d.expected && (
                  <span className="problem-detail">
                    Expected {d.expected}
                    {d.found !== undefined &&
                      (d.found === 'end of input' ? ', found end of input' : `, found '${d.found}'`)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
