import { describe, expect, it } from 'vitest';
import {
  compile, generate, parse, tokenize, type IntermediateProgram, type SourceSpan,
} from '../src/compiler';
import { execute, INTEGER_LIMIT, RuntimeInternalError, runnableProgram, type ExecutionResult } from '../src/runtime';

/** Compile source that must succeed, and return its instructions. */
function program(source: string): IntermediateProgram {
  const compiled = runnableProgram(compile(source));
  if (!compiled) throw new Error('Expected a successful compilation: ' + source);
  return compiled;
}

const run = (source: string): ExecutionResult => execute(program(source));
/** Printed text exactly as a console would show it. */
const output = (source: string): string => {
  const result = run(source);
  expect(result.status).toBe('success');
  return result.text;
};

const NINES = '9'.repeat(100); // 10^100 - 1, the largest allowed magnitude
const SPAN: SourceSpan = Object.freeze({ offset: 0, length: 1, line: 1, column: 1 });

function deepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(deepFrozen);
}

describe('runner: the documented programs', () => {
  it('prints 75 for the marks program', () => {
    expect(output('let marks = 70;\nlet bonus = 5;\nprint marks + bonus;')).toBe('75\n');
  });

  it.each([
    ['print 2 + 3 * 4;', '14\n'],
    ['print (2 + 3) * 4;', '20\n'],
    ['print 20 - 5 - 3;', '12\n'],
    ['print -3 * 2;', '-6\n'],
    ['print --3;', '3\n'],
    ['print 1; print 2;', '1\n2\n'],
  ])('%j prints %j', (source, expected) => {
    expect(output(source)).toBe(expected);
  });

  it.each(['', '# only a comment', '\n\n'])('runs the empty program %j successfully with no output', (source) => {
    const compiled = runnableProgram(compile(source));
    expect(compiled).toEqual({ instructions: [], temporaryCount: 0 });
    expect(execute(compiled!)).toEqual({ status: 'success', lines: [], text: '', diagnostic: null, executedCount: 0 });
  });
});

describe('runner: instructions and operands', () => {
  it('executes every instruction kind', () => {
    const source = 'let a = 6;\nlet b = a;\nprint a + b;\nprint a - 10;\nprint a * b;\nprint -a;';
    expect(program(source).instructions.map((i) => i.opcode)).toEqual([
      'COPY', 'COPY', 'ADD', 'PRINT', 'SUB', 'PRINT', 'MUL', 'PRINT', 'NEG', 'PRINT',
    ]);
    expect(output(source)).toBe('12\n-4\n36\n-6\n');
  });

  it('resolves literal, variable, and temporary operands', () => {
    expect(output('print 7;')).toBe('7\n'); // literal
    expect(output('let x = 8;\nprint x;')).toBe('8\n'); // variable
    expect(output('print 4 * 5;')).toBe('20\n'); // temporary %t1
    expect(output('let x = 2 + 3;\nprint x;')).toBe('5\n'); // COPY from a temporary
  });

  it('handles positive and negative arithmetic', () => {
    expect(output('print 3 - 10;\nprint -3 * -4;\nprint -3 * 4;\nprint 0 - 7 + 7;\nprint -0;')).toBe('-7\n12\n-12\n0\n0\n');
  });

  it('follows precedence, grouping, associativity, and unary minus', () => {
    expect(output('print 2 * 3 + 4;\nprint 2 * (3 + 4);\nprint 100 - 10 - 1;\nprint 100 - (10 - 1);\nprint -(2 + 3) * 4;\nprint 3--2;'))
      .toBe('10\n14\n89\n91\n-20\n5\n');
  });

  it('runs multiple declarations and prints in order', () => {
    expect(output('let a = 1;\nprint a;\nlet b = a + 1;\nprint b;\nlet c = a + b;\nprint c * 10;')).toBe('1\n2\n30\n');
  });

  it('keeps variable t1 and temporary %t1 in separate storage', () => {
    expect(output('let t1 = 7;\nprint t1 + 1;')).toBe('8\n');
    // %t1 holds 6 while variable t1 still holds 100.
    expect(output('let t1 = 100;\nlet x = 2 * 3;\nprint t1;\nprint x;')).toBe('100\n6\n');
  });

  it('keeps names such as __proto__ and constructor as ordinary variables', () => {
    expect(output('let __proto__ = 1;\nlet constructor = 2;\nprint __proto__ + constructor;')).toBe('3\n');
  });
});

describe('runner: exact integers and the 10^100 limit', () => {
  it('prints exact large values without rounding', () => {
    expect(output(`print ${NINES};`)).toBe(NINES + '\n');
    expect(output(`print -${NINES};`)).toBe('-' + NINES + '\n');
    expect(output('print 99999999999999999999 * 99999999999999999999;'))
      .toBe('9999999999999999999800000000000000000001\n');
    expect(output('print 9007199254740993 + 0;')).toBe('9007199254740993\n'); // not representable as a Number
  });

  it('allows values just inside the limit', () => {
    const halfway = '1' + '0'.repeat(50); // 10^50
    expect(output(`print ${NINES} - 0;\nprint 0 - ${NINES};\nprint ${halfway} * ${'9'.repeat(50)};`))
      .toBe(`${NINES}\n-${NINES}\n${'9'.repeat(50)}${'0'.repeat(50)}\n`);
    expect(INTEGER_LIMIT).toBe(10n ** 100n);
  });

  it.each([
    ['ADD', `print ${NINES} + 1;`, '+', 101],
    ['SUB', `print 0 - ${NINES} - 1;`, '-', 101],
    ['MUL', `print ${'1' + '0'.repeat(50)} * ${'1' + '0'.repeat(50)};`, '*', 101],
    ['MUL', `print ${NINES} * ${NINES};`, '*', 200],
  ])('rejects a %s result at exactly or beyond 10^100: %j', (opcode, source, operator, digits) => {
    const result = run(source);
    expect(result.status).toBe('error');
    expect(result.diagnostic).toMatchObject({
      phase: 'runtime', severity: 'error', code: 'integer-limit-exceeded', found: `a ${digits}-digit result`,
    });
    const d = result.diagnostic!;
    expect(source.slice(d.offset, d.offset + d.length)).toBe(operator);
    expect(program(source).instructions.some((i) => i.opcode === opcode)).toBe(true);
  });

  it('fails on an intermediate overflow even if the final value would fit', () => {
    const source = `let big = ${NINES};\nprint big + 1 - 1;`;
    const result = run(source);
    expect(result.status).toBe('error');
    expect(result.diagnostic).toMatchObject({ line: 2, column: 11 }); // the '+', not the '-'
    expect(result.lines).toEqual([]);
  });

  it('checks NEG results too, and accepts negating the largest value', () => {
    expect(output(`let big = ${NINES};\nprint -big;`)).toBe('-' + NINES + '\n');
  });
});

describe('runner: runtime diagnostics and partial output', () => {
  it('stops immediately and keeps only the output printed before the error', () => {
    const source = `let big = ${NINES};\nprint 1;\nprint 2;\nprint big *\n  big;\nprint 3;`;
    const result = run(source);
    expect(result.status).toBe('error');
    expect(result.lines).toEqual(['1', '2']);
    expect(result.text).toBe('1\n2\n');
    expect(result.diagnostic).toMatchObject({ line: 4, column: 11, length: 1 });
    expect(result.diagnostic?.message).toContain("'*' produced a 200-digit value");
    expect(result.executedCount).toBe(3); // COPY, PRINT, PRINT; the MUL failed
  });

  it('points at the exact operator after tabs and non-ASCII comments', () => {
    const source = `# café \u{1F600}\n\tlet big = ${NINES};\n\tprint  big  *  big;`;
    const d = run(source).diagnostic!;
    expect(d).toMatchObject({ line: 3, column: 14 });
    expect(source.slice(d.offset, d.offset + d.length)).toBe('*');
  });
});

describe('runner: fresh state and purity', () => {
  it('gives identical, independent results when run twice', () => {
    const compiled = program('let a = 2;\nprint a * 21;\nprint a;');
    const first = execute(compiled);
    const second = execute(compiled);
    expect(second).toEqual(first);
    expect(second.text).toBe('42\n2\n'); // not '42\n2\n42\n2\n'
    expect(second).not.toBe(first);
    expect(second.lines).not.toBe(first.lines);
  });

  it('starts every run with empty variable storage', () => {
    execute(program('let x = 5;\nprint x;'));
    // A hand-built program that reads x without assigning it: x must not survive from the last run.
    const readsX: IntermediateProgram = {
      temporaryCount: 0,
      instructions: [{ opcode: 'PRINT', operand: { kind: 'variable', name: 'x' }, span: SPAN }],
    };
    expect(() => execute(readsX)).toThrow(RuntimeInternalError);
  });

  it('starts every run with empty temporary storage', () => {
    execute(program('print 1 + 2;'));
    const readsT1: IntermediateProgram = {
      temporaryCount: 1,
      instructions: [{ opcode: 'PRINT', operand: { kind: 'temporary', id: 1 }, span: SPAN }],
    };
    expect(() => execute(readsT1)).toThrow('Temporary %t1 has no value.');
  });

  it('can run a failing program again from a fresh state', () => {
    const compiled = program(`print 1;\nprint ${NINES} + 1;`);
    const first = execute(compiled);
    const second = execute(compiled);
    expect(first.status).toBe('error');
    expect(second).toEqual(first);
    expect(second.lines).toEqual(['1']);
  });

  it('does not modify the instructions or any compilation artifact', () => {
    const compiled = compile('let a = -(2 + 3);\nprint a * a;\nprint a - 1;');
    const before = JSON.stringify(compiled);
    const instructions = runnableProgram(compiled)!;
    execute(instructions);
    execute(instructions);
    expect(JSON.stringify(compiled)).toBe(before);
    expect(deepFrozen(instructions)).toBe(true);
    expect(deepFrozen(compiled.phases.syntax.output)).toBe(true);
    expect(deepFrozen(compiled.phases.semantic.output)).toBe(true);
  });

  it('returns frozen execution results', () => {
    expect(deepFrozen(run('print 1;'))).toBe(true);
    expect(deepFrozen(run(`print ${NINES} + 1;`))).toBe(true);
  });
});

describe('runner: internal defects', () => {
  it.each([
    ['a non-canonical literal', { kind: 'integer', value: '007' }],
    ['a literal beyond the limit', { kind: 'integer', value: '1' + '0'.repeat(100) }],
    ['a variable with no value', { kind: 'variable', name: 'ghost' }],
  ] as const)('throws RuntimeInternalError for %s', (_label, operand) => {
    const broken: IntermediateProgram = {
      temporaryCount: 0, instructions: [Object.freeze({ opcode: 'PRINT', operand, span: SPAN })],
    };
    expect(() => execute(broken)).toThrow(RuntimeInternalError);
  });

  it('throws RuntimeInternalError for an unknown opcode', () => {
    const broken = { temporaryCount: 0, instructions: [{ opcode: 'JUMP', span: SPAN }] } as unknown as IntermediateProgram;
    expect(() => execute(broken)).toThrow('Unknown instruction opcode: JUMP');
  });
});

describe('compile-then-run workflow', () => {
  it.each([
    ['input', ' '.repeat(5001) + 'print 1;'],
    ['lexical', 'print 1 @ 2;'],
    ['syntax', 'print 1 + ;'],
    ['semantic', 'print missing;'],
  ])('offers nothing to run after a(n) %s failure', (phase, source) => {
    const compiled = compile(source);
    expect(compiled.failedPhase).toBe(phase);
    expect(runnableProgram(compiled)).toBeNull();
  });

  it('recovers after the program is corrected', () => {
    expect(runnableProgram(compile('print marks + bonus;'))).toBeNull();
    expect(output('let marks = 70;\nlet bonus = 5;\nprint marks + bonus;')).toBe('75\n');
  });

  it('recovers from a runtime error once the program is corrected', () => {
    expect(run(`print ${NINES} + 1;`).status).toBe('error');
    expect(output(`print ${NINES} - 1;`)).toBe('9'.repeat(99) + '8\n');
  });

  it('runs the generator output directly, without display strings', () => {
    const lex = tokenize('print 6 * 7;');
    const parsed = parse(lex.tokens);
    expect(execute(generate(parsed.ast!)).text).toBe('42\n');
  });
});
