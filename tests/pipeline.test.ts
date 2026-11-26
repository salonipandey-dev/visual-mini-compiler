import { describe, expect, it } from 'vitest';
import { compile, formatDiagnostic } from '../src/compiler';
import { EXAMPLES } from '../src/examples/examples';

describe('pipeline', () => {
  it('runs the lexer and marks unbuilt phases as not-built', () => {
    const result = compile('int x = 10;');
    expect(result.failedPhase).toBeNull();
    expect(result.phases.lexical.status).toBe('success');
    expect(result.phases.lexical.output).toHaveLength(6);
    expect(result.phases.syntax.status).toBe('not-built');
    expect(result.phases.semantic.status).toBe('not-built');
  });

  it('keeps the tokens but skips later phases after a lexical error', () => {
    const result = compile('int x = 10 @ 2;');
    expect(result.failedPhase).toBe('lexical');
    expect(result.phases.lexical.status).toBe('error');
    expect(result.phases.lexical.output?.length).toBeGreaterThan(0);
    expect(result.phases.syntax.status).toBe('skipped');
    expect(result.phases.semantic.status).toBe('skipped');
    expect(result.diagnostics.map(formatDiagnostic)).toEqual([
      "lexical error at 1:12: Unexpected character '@'",
    ]);
  });

  it('recovers completely once the error is fixed', () => {
    const broken = compile('int x = 10 @ 2;');
    const fixed = compile('int x = 10 * 2;');
    expect(broken.diagnostics).toHaveLength(1);
    expect(fixed.failedPhase).toBeNull();
    expect(fixed.diagnostics).toEqual([]);
    expect(fixed.phases.lexical.output?.some((t) => t.type === 'ERROR')).toBe(false);
  });

  it('gives fresh, independent results for every compile', () => {
    const first = compile('int a;');
    const second = compile('int a;');
    expect(second).toEqual(first);
    expect(second.phases.lexical.output).not.toBe(first.phases.lexical.output);
  });

  it('records the exact source it compiled', () => {
    expect(compile('print(1);').source).toBe('print(1);');
  });
});

describe('example programs', () => {
  for (const example of EXAMPLES) {
    it(`"${example.title}" ${example.expect ? `fails in ${example.expect}` : 'passes'}`, () => {
      expect(compile(example.source).failedPhase).toBe(example.expect);
    });
  }
});
