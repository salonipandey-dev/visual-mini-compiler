/**
 * PhasePipeline — the phase tabs, drawn as a pipeline track.
 * Each tab shows the phase's status; the line between two phases shows
 * whether data flowed through (emerald), stopped (coral) or never got there.
 */
import { Fragment, useRef, type KeyboardEvent } from 'react';
import { PHASES, type CompileResult, type PhaseId, type PhaseStatus } from '../compiler';

type ViewStatus = PhaseStatus | 'idle';

interface Props {
  result: CompileResult | null;
  active: PhaseId;
  onSelect: (phase: PhaseId) => void;
}

export function PhasePipeline({ result, active, onSelect }: Props) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Arrow keys move between tabs (the standard ARIA tabs pattern).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = PHASES.findIndex((p) => p.id === active);
    let next = current;
    if (e.key === 'ArrowRight') next = (current + 1) % PHASES.length;
    else if (e.key === 'ArrowLeft') next = (current - 1 + PHASES.length) % PHASES.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = PHASES.length - 1;
    else return;
    e.preventDefault();
    onSelect(PHASES[next].id);
    tabRefs.current[next]?.focus();
  };

  const statuses: ViewStatus[] = PHASES.map((p) => (result ? result.phases[p.id].status : 'idle'));

  return (
    <div className="pipeline" role="tablist" aria-label="Compiler phases" onKeyDown={onKeyDown}>
      {PHASES.map((phase, i) => {
        const status = statuses[i];
        const selected = phase.id === active;
        return (
          <Fragment key={phase.id}>
            {i > 0 && <span className={`pipe pipe-${pipeState(statuses[i - 1], status)}`} aria-hidden="true" />}
            <button
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${phase.id}`}
              aria-controls={`panel-${phase.id}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className={`stage stage-${status}${selected ? ' is-active' : ''}`}
              onClick={() => onSelect(phase.id)}
            >
              <span className="stage-node" aria-hidden="true">
                {nodeGlyph(status, i + 1)}
              </span>
              <span className="stage-text">
                <span className="stage-title">
                  <span className="title-long">{phase.title}</span>
                  <span className="title-short">{phase.title.split(' ')[0]}</span>
                </span>
                <span className="stage-caption">{caption(result, phase.id, status)}</span>
              </span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

function pipeState(before: ViewStatus, after: ViewStatus): 'flow' | 'blocked' | 'idle' {
  if (before === 'error') return 'blocked';
  if (before === 'success' && (after === 'success' || after === 'error')) return 'flow';
  return 'idle';
}

function nodeGlyph(status: ViewStatus, n: number): string {
  if (status === 'success') return '✓'; // ✓
  if (status === 'error') return '✕'; // ✕
  return String(n);
}

function caption(result: CompileResult | null, id: PhaseId, status: ViewStatus): string {
  switch (status) {
    case 'idle':
      return 'Not run';
    case 'skipped':
      return 'Skipped';
    case 'not-built':
      return 'Not built yet';
    case 'error': {
      const n = result?.phases[id].diagnostics.length ?? 0;
      return n === 1 ? '1 error' : `${n} errors`;
    }
    case 'success':
      if (id === 'lexical') {
        const n = result?.phases.lexical.output?.length ?? 0;
        return n === 1 ? '1 token' : `${n} tokens`;
      }
      return 'Passed';
  }
}
