import { describe, expect, it } from 'vitest';
import { compile, formatDiagnostic } from '../src/compiler';
import { EXAMPLES } from '../src/examples/examples';

describe('compilation pipeline', () => {
  it('runs lexical, syntax, semantic analysis, and code generation in order', () => {
    const result = compile('let x = 10; print x;');
    expect(result.failedPhase).toBeNull();
    expect(result.phases.lexical.status).toBe('success');
    expect(result.phases.syntax.status).toBe('success');
    expect(result.phases.syntax.output?.statements).toHaveLength(2);
    expect(result.phases.semantic.status).toBe('success');
    expect(result.phases.semantic.output?.symbols.map((s) => s.name)).toEqual(['x']);
    expect(result.phases.semantic.output?.complete).toBe(true);
    expect(result.phases.intermediate.status).toBe('success');
    expect(result.phases.intermediate.output?.instructions.map((i) => i.opcode)).toEqual(['COPY', 'PRINT']);
  });

  it('skips parser and semantics after a lexical error', () => {
    const result = compile('print 2 @ 3;');
    expect(result.failedPhase).toBe('lexical');
    expect(result.phases.syntax).toMatchObject({ status: 'skipped', output: null });
    expect(result.phases.semantic.status).toBe('skipped');
    expect(result.phases.intermediate).toMatchObject({ status: 'skipped', output: null });
    expect(result.diagnostics.map(formatDiagnostic)).toEqual([
      "lexical error at 1:9: Unexpected character '@'",
    ]);
  });

  it('preserves completed tokens but skips semantics after a syntax error', () => {
    const result = compile('print 2 + ;');
    expect(result.failedPhase).toBe('syntax');
    expect(result.phases.lexical.status).toBe('success');
    expect(result.phases.syntax.output).toBeNull();
    expect(result.phases.semantic.status).toBe('skipped');
    expect(result.diagnostics[0]).toMatchObject({ phase: 'syntax', column: 11 });
  });

  it('rejects excessive source before tokenization and parsing', () => {
    const result = compile(' '.repeat(5001));
    expect(result.failedPhase).toBe('input');
    expect(result.phases.lexical.output).toEqual([]);
    expect(result.phases.syntax.status).toBe('skipped');
    expect(result.diagnostics[0].phase).toBe('input');
  });

  it('recovers completely after a failure and uses fresh results', () => {
    const broken = compile('print 2 + ;');
    const fixed = compile('print 2 + 3;');
    const again = compile('print 2 + 3;');
    expect(broken.diagnostics).toHaveLength(1);
    expect(fixed.diagnostics).toEqual([]);
    expect(fixed).toEqual(again);
    expect(fixed.phases.syntax.output).not.toBe(again.phases.syntax.output);
  });

  it('records normalized source so selection offsets match the displayed text', () => {
    expect(compile('print 1;\r\n').source).toBe('print 1;\n');
  });

  it('parses an undeclared variable successfully, then rejects it in semantic analysis', () => {
    const result = compile('print missing;');
    expect(result.phases.syntax.status).toBe('success');
    expect(result.phases.semantic.status).toBe('error');
    expect(result.failedPhase).toBe('semantic');
    expect(result.diagnostics.map(formatDiagnostic)).toEqual([
      "semantic error at 1:7: Undeclared variable 'missing'. (expected a variable declared earlier with let)",
    ]);
  });

  it.each(['', '# empty program'])('accepts an empty program %j', (source) => {
    expect(compile(source).phases.syntax.output?.statements).toEqual([]);
    expect(compile(source).failedPhase).toBeNull();
    expect(compile(source).phases.semantic.output).toEqual({ symbols: [], complete: true });
  });
});

describe('all example programs', () => {
  for (const example of EXAMPLES) {
    it(example.title, () => {
      expect(compile(example.source).failedPhase).toBe(example.expect);
    });
  }
});
