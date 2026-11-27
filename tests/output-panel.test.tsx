import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler';
import { execute, runnableProgram } from '../src/runtime';
import { ErrorBoundary } from '../src/ui/ErrorBoundary';
import { OutputPanel, type OutputState } from '../src/ui/OutputPanel';

const render = (state: OutputState): string =>
  renderToStaticMarkup(<OutputPanel state={state} onShowSource={() => {}} />);

/** Compile and run real source, then render the panel for that run. */
function ran(source: string, run = 1): string {
  const program = runnableProgram(compile(source));
  if (!program) throw new Error('Expected a runnable compilation.');
  return render({ kind: 'ran', compilation: 3, run, result: execute(program) });
}

const NINES = '9'.repeat(100);

describe('output panel', () => {
  it('explains how to get output before anything is compiled', () => {
    expect(render({ kind: 'not-compiled' })).toContain('Compile the program, then press Run');
  });

  it('explains why Run is unavailable after a failed compilation', () => {
    expect(render({ kind: 'compile-failed', compilation: 2 })).toContain('Run is unavailable because compilation 2 failed');
  });

  it('explains why Run is unavailable after an edit', () => {
    expect(render({ kind: 'stale', compilation: 4 })).toContain('source changed after compilation 4');
  });

  it('shows a ready state, including for an empty program', () => {
    expect(render({ kind: 'ready', compilation: 1, instructionCount: 4 })).toContain('execute its 4 instructions');
    expect(render({ kind: 'ready', compilation: 1, instructionCount: 0 })).toContain('execute its 0 instructions');
  });

  it('shows the printed output of a successful run', () => {
    const html = ran('let marks = 70;\nlet bonus = 5;\nprint marks + bonus;');
    expect(html).toContain('Ran successfully');
    expect(html).toContain('Run 1 of compilation 3 finished successfully and printed 1 line.');
    expect(html).toMatch(/<pre[^>]*aria-label="Program output"[^>]*>75<\/pre>/);
  });

  it('shows one line per PRINT, exactly', () => {
    expect(ran(`print 1;\nprint -2;\nprint ${NINES};`, 2)).toMatch(new RegExp(`>1\\n-2\\n${NINES}</pre>`));
  });

  it('shows a successful empty run as printing nothing', () => {
    const html = ran('# empty');
    expect(html).toContain('printed 0 lines');
    expect(html).toContain('The program printed nothing.');
    expect(html).not.toContain('<pre');
  });

  it('labels output before a runtime error as partial and shows the diagnostic', () => {
    const html = ran(`print 1;\nprint 2;\nprint ${NINES} + 1;\nprint 3;`);
    expect(html).toContain('Runtime error');
    expect(html).toContain('stopped with a runtime error at line 3, column 108');
    expect(html).toContain('Compilation itself succeeded.');
    expect(html).toContain('Integer limit exceeded');
    expect(html).toContain('Show in source');
    expect(html).toContain('Partial output (printed before the error)');
    expect(html).toMatch(/aria-label="Partial program output"[^>]*>1\n2<\/pre>/);
    expect(html).not.toContain('>3<');
  });

  it('says when nothing was printed before a runtime error', () => {
    expect(ran(`print ${NINES} * 2;`)).toContain('Nothing was printed before the error.');
  });

  it('describes an internal error without technical details', () => {
    const html = render({ kind: 'internal-error', compilation: 1, run: 2 });
    expect(html).toContain('internal error in the workbench, not in your program');
    expect(html).not.toMatch(/at \w+ \(|Error:|stack/i);
  });
});

describe('error boundary', () => {
  it('turns any render error into the error state', () => {
    expect(ErrorBoundary.getDerivedStateFromError()).toEqual({ hasError: true });
  });

  it('shows a calm message without a stack trace', () => {
    const boundary = new ErrorBoundary({ children: null });
    boundary.state = { hasError: true };
    const html = renderToStaticMarkup(<>{boundary.render()}</>);
    expect(html).toContain('internal error');
    expect(html).toContain('not in your program');
    expect(html).toContain('Reload the workbench');
    expect(html).not.toMatch(/stack|at \w+ \(/i);
  });

  it('renders its children normally when nothing failed', () => {
    const html = renderToStaticMarkup(<ErrorBoundary><p>workbench</p></ErrorBoundary>);
    expect(html).toBe('<p>workbench</p>');
  });
});
