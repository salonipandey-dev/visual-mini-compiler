import { describe, expect, it } from 'vitest';
import {
  analyze, compile, formatInstruction, formatOperand, generate, parse, tokenize,
  type Instruction, type IntermediateProgram, type Opcode, type Program,
} from '../src/compiler';

/** Parse source that must pass every phase before code generation. */
function checkedProgram(source: string): Program {
  const lex = tokenize(source);
  expect(lex.diagnostics).toEqual([]);
  const parsed = parse(lex.tokens);
  expect(parsed.diagnostics).toEqual([]);
  if (!parsed.ast) throw new Error('Expected an AST.');
  expect(analyze(parsed.ast).diagnostics).toEqual([]);
  return parsed.ast;
}

const ir = (source: string): IntermediateProgram => generate(checkedProgram(source));
const text = (source: string): string[] => ir(source).instructions.map(formatInstruction);
const opcodes = (source: string): string[] => ir(source).instructions.map((i) => i.opcode);

function deepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(deepFrozen);
}

/** Assert an instruction's opcode and narrow its type (ADD, SUB and MUL share one interface). */
function only<T extends Opcode>(instruction: Instruction, opcode: T): Instruction & { opcode: T } {
  expect(instruction.opcode).toBe(opcode);
  return instruction as Instruction & { opcode: T };
}

describe('code generation: the documented examples', () => {
  it('generates multiplication before addition for print 2 + 3 * 4;', () => {
    expect(text('print 2 + 3 * 4;')).toEqual(['%t1 = 3 * 4', '%t2 = 2 + %t1', 'PRINT %t2']);
  });

  it('copies declarations and adds variables', () => {
    expect(text('let marks = 70;\nlet bonus = 5;\nprint marks + bonus;')).toEqual([
      'marks = 70', 'bonus = 5', '%t1 = marks + bonus', 'PRINT %t1',
    ]);
  });

  it('keeps subtraction left-associative', () => {
    expect(text('print 20 - 5 - 3;')).toEqual(['%t1 = 20 - 5', '%t2 = %t1 - 3', 'PRINT %t2']);
  });

  it('keeps a source variable named t1 apart from temporary %t1', () => {
    expect(text('let t1 = 7;\nprint t1 + 1;')).toEqual(['t1 = 7', '%t1 = t1 + 1', 'PRINT %t1']);
  });
});

describe('code generation: operands and instructions', () => {
  it('uses a literal operand directly, without a temporary', () => {
    const result = ir('print 5;');
    expect(result.instructions).toEqual([
      { opcode: 'PRINT', operand: { kind: 'integer', value: '5' }, span: { offset: 0, length: 8, line: 1, column: 1 } },
    ]);
    expect(result.temporaryCount).toBe(0);
  });

  it('uses a variable operand directly', () => {
    const [copy, print] = ir('let a = 1;\nprint a;').instructions;
    expect(only(copy, 'COPY')).toMatchObject({ target: { kind: 'variable', name: 'a' }, source: { kind: 'integer', value: '1' } });
    expect(only(print, 'PRINT').operand).toEqual({ kind: 'variable', name: 'a' });
  });

  it('copies one variable into another', () => {
    expect(text('let a = 1;\nlet b = a;')).toEqual(['a = 1', 'b = a']);
  });

  it('copies a computed value from its temporary', () => {
    const result = ir('let x = 2 + 3;');
    expect(result.instructions.map(formatInstruction)).toEqual(['%t1 = 2 + 3', 'x = %t1']);
    expect(only(result.instructions[1], 'COPY').source).toEqual({ kind: 'temporary', id: 1 });
  });

  it('emits ADD, SUB, MUL, and NEG for the four operations', () => {
    expect(opcodes('print 1 + 2;\nprint 3 - 4;\nprint 5 * 6;\nprint -7;')).toEqual([
      'ADD', 'PRINT', 'SUB', 'PRINT', 'MUL', 'PRINT', 'NEG', 'PRINT',
    ]);
  });

  it('gives every arithmetic instruction a temporary target and both operands', () => {
    const add = only(ir('let a = 1;\nprint a * 3;').instructions[1], 'MUL');
    expect(add.target).toEqual({ kind: 'temporary', id: 1 });
    expect(add.left).toEqual({ kind: 'variable', name: 'a' });
    expect(add.right).toEqual({ kind: 'integer', value: '3' });
  });

  it('does not fold constants or evaluate anything', () => {
    expect(text('print 2 + 3;')).toEqual(['%t1 = 2 + 3', 'PRINT %t1']);
    expect(text('print -3;')).toEqual(['%t1 = minus 3', 'PRINT %t1']);
  });
});

describe('code generation: nesting, precedence, and order', () => {
  it('chains repeated unary minus from the inside out', () => {
    expect(text('print --3;')).toEqual(['%t1 = minus 3', '%t2 = minus %t1', 'PRINT %t2']);
  });

  it('negates a grouped expression before multiplying', () => {
    expect(text('print -(2 + 3) * 4;')).toEqual([
      '%t1 = 2 + 3', '%t2 = minus %t1', '%t3 = %t2 * 4', 'PRINT %t3',
    ]);
  });

  it('applies unary minus before multiplication', () => {
    expect(text('print -3 * 2;')).toEqual(['%t1 = minus 3', '%t2 = %t1 * 2', 'PRINT %t2']);
  });

  it('follows the AST for precedence and explicit grouping', () => {
    expect(text('print 2 * 3 + 4;')).toEqual(['%t1 = 2 * 3', '%t2 = %t1 + 4', 'PRINT %t2']);
    expect(text('print (2 + 3) * 4;')).toEqual(['%t1 = 2 + 3', '%t2 = %t1 * 4', 'PRINT %t2']);
  });

  it('keeps multiplication left-associative', () => {
    expect(text('print 2 * 3 * 4;')).toEqual(['%t1 = 2 * 3', '%t2 = %t1 * 4', 'PRINT %t2']);
  });

  it('generates a right-hand group before the operation that uses it', () => {
    expect(text('print 1 - (2 - 3);')).toEqual(['%t1 = 2 - 3', '%t2 = 1 - %t1', 'PRINT %t2']);
  });

  it('generates the left operand completely before the right operand', () => {
    expect(text('print (1 + 2) * (3 + 4);')).toEqual([
      '%t1 = 1 + 2', '%t2 = 3 + 4', '%t3 = %t1 * %t2', 'PRINT %t3',
    ]);
    expect(text('let a = 1;\nprint -a - 3 * a;')).toEqual([
      'a = 1', '%t1 = minus a', '%t2 = 3 * a', '%t3 = %t1 - %t2', 'PRINT %t3',
    ]);
  });

  it('emits nothing for grouping parentheses', () => {
    expect(text('print ((((7))));')).toEqual(['PRINT 7']);
    expect(text('let a = (1);\nprint (a);')).toEqual(['a = 1', 'PRINT a']);
  });

  it('keeps statements and prints in source order', () => {
    expect(text('let a = 1;\nprint a;\nlet b = a + 2;\nprint b * a;\nprint 0;')).toEqual([
      'a = 1', 'PRINT a', '%t1 = a + 2', 'b = %t1', '%t2 = b * a', 'PRINT %t2', 'PRINT 0',
    ]);
  });
});

describe('code generation: temporaries and namespaces', () => {
  it('numbers temporaries consecutively across statements', () => {
    const result = ir('print 1 + 2;\nprint 3 + 4;\nlet x = 5 * 6;');
    expect(result.instructions.map(formatInstruction)).toEqual([
      '%t1 = 1 + 2', 'PRINT %t1', '%t2 = 3 + 4', 'PRINT %t2', '%t3 = 5 * 6', 'x = %t3',
    ]);
    expect(result.temporaryCount).toBe(3);
  });

  it('starts again at %t1 for every generation', () => {
    const first = ir('print 1 + 2 + 3;');
    const second = ir('print 4 * 5;');
    expect(first.instructions.map(formatInstruction)[1]).toBe('%t2 = %t1 + 3');
    expect(second.instructions.map(formatInstruction)).toEqual(['%t1 = 4 * 5', 'PRINT %t1']);
  });

  it('tags variables and temporaries differently even when their names look alike', () => {
    const [copy, add] = ir('let t1 = 7;\nlet t2 = t1 + 1;').instructions;
    const target = only(copy, 'COPY').target;
    const temp = only(add, 'ADD').target;
    expect(target).toEqual({ kind: 'variable', name: 't1' });
    expect(temp).toEqual({ kind: 'temporary', id: 1 });
    expect(formatOperand(target)).toBe('t1');
    expect(formatOperand(temp)).toBe('%t1');
    expect(text('let t1 = 7;\nlet t2 = t1 + 1;\nprint t2 * t1;')).toEqual([
      't1 = 7', '%t1 = t1 + 1', 't2 = %t1', '%t2 = t2 * t1', 'PRINT %t2',
    ]);
  });
});

describe('code generation: literals, spans, and purity', () => {
  it('keeps a 100-digit literal as exact decimal text', () => {
    const digits = '9'.repeat(100);
    const [mul] = ir(`print ${digits} * ${digits};`).instructions;
    expect(only(mul, 'MUL').left).toEqual({ kind: 'integer', value: digits });
    expect(formatInstruction(mul)).toBe(`%t1 = ${digits} * ${digits}`);
  });

  it('uses the canonical value for literals written with leading zeros', () => {
    expect(text('print 007 + 0;')).toEqual(['%t1 = 7 + 0', 'PRINT %t1']);
    expect(text('print 0' + '1'.repeat(99) + ';')).toEqual(['PRINT ' + '1'.repeat(99)]);
  });

  it('records the exact position of each arithmetic operator', () => {
    const source = 'let a = 1;\nprint a -\n  -(2 * 3);';
    const [, mul, neg, sub] = ir(source).instructions;
    const at = (span: { offset: number; length: number }) => source.slice(span.offset, span.offset + span.length);
    expect(only(mul, 'MUL').operatorSpan).toMatchObject({ line: 3, column: 7 });
    expect(only(neg, 'NEG').operatorSpan).toMatchObject({ line: 3, column: 3 });
    expect(only(sub, 'SUB').operatorSpan).toMatchObject({ line: 2, column: 9 });
    expect(at(only(mul, 'MUL').operatorSpan)).toBe('*');
    expect(at(only(neg, 'NEG').operatorSpan)).toBe('-');
    expect(at(only(sub, 'SUB').operatorSpan)).toBe('-');
    expect(at(only(sub, 'SUB').span)).toBe('a -\n  -(2 * 3)');
  });

  it('reuses the AST spans instead of copying them', () => {
    const ast = checkedProgram('let total = 2 + 3;\nprint total;');
    const [declaration, print] = ast.statements;
    if (declaration.kind !== 'LetDeclaration' || declaration.initializer.kind !== 'BinaryExpression') {
      throw new Error('Expected let total = 2 + 3;');
    }
    const [add, copy, printInstruction] = generate(ast).instructions;
    expect(only(add, 'ADD').operatorSpan).toBe(declaration.initializer.operatorSpan);
    expect(only(add, 'ADD').span).toBe(declaration.initializer.span);
    expect(only(copy, 'COPY').span).toBe(declaration.span);
    expect(only(copy, 'COPY').targetSpan).toBe(declaration.nameSpan);
    expect(only(printInstruction, 'PRINT').span).toBe(print.span);
  });

  it.each(['', '# only a comment', '\n\n'])('generates an empty instruction list for %j', (source) => {
    expect(ir(source)).toEqual({ instructions: [], temporaryCount: 0 });
  });

  it('is deterministic: the same AST gives equal, separate results', () => {
    const ast = checkedProgram('let a = -(1 + 2);\nprint a * a - 3;');
    const first = generate(ast);
    const second = generate(ast);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.instructions).not.toBe(first.instructions);
  });

  it('returns deeply frozen instructions', () => {
    expect(deepFrozen(ir('let a = 1;\nprint -(a + 2) * 3;'))).toBe(true);
  });

  it('does not modify the AST or the symbol table', () => {
    const ast = checkedProgram('let a = 1;\nlet b = -(a + 2) * a;\nprint b - a;');
    const table = analyze(ast).symbolTable;
    const astBefore = JSON.stringify(ast);
    const tableBefore = JSON.stringify(table);
    generate(ast);
    generate(ast);
    expect(JSON.stringify(ast)).toBe(astBefore);
    expect(JSON.stringify(table)).toBe(tableBefore);
    expect(deepFrozen(ast)).toBe(true);
    expect(deepFrozen(table)).toBe(true);
  });
});

describe('code generation in the pipeline', () => {
  it('generates instructions after every earlier phase succeeds', () => {
    const result = compile('let marks = 70;\nlet bonus = 5;\nprint marks + bonus;');
    expect(result.failedPhase).toBeNull();
    expect(result.phases.intermediate.status).toBe('success');
    expect(result.phases.intermediate.output?.instructions.map(formatInstruction)).toEqual([
      'marks = 70', 'bonus = 5', '%t1 = marks + bonus', 'PRINT %t1',
    ]);
    expect(result.phases.semantic.output?.symbols.map((s) => s.name)).toEqual(['marks', 'bonus']);
  });

  it('generates an empty list for an empty program', () => {
    expect(compile('').phases.intermediate).toMatchObject({
      status: 'success', output: { instructions: [], temporaryCount: 0 },
    });
  });

  it.each([
    ['input', ' '.repeat(5001) + 'print 1 + 2;'],
    ['lexical', 'print 1 @ 2;'],
    ['syntax', 'print 1 + ;'],
    ['semantic', 'print 1 + missing;'],
  ])('skips generation and exposes no instructions after a(n) %s failure', (phase, source) => {
    const result = compile(source);
    expect(result.failedPhase).toBe(phase);
    expect(result.phases.intermediate).toMatchObject({ status: 'skipped', output: null, diagnostics: [] });
  });

  it('keeps the partial symbol table when generation is skipped after a semantic error', () => {
    const result = compile('let a = 1;\nprint b;');
    expect(result.phases.semantic.output).toMatchObject({ complete: false });
    expect(result.phases.semantic.output?.symbols.map((s) => s.name)).toEqual(['a']);
    expect(result.phases.intermediate.output).toBeNull();
  });

  it('recovers after the program is corrected, with numbering reset to %t1', () => {
    expect(compile('let total = total + 1;').phases.intermediate.status).toBe('skipped');
    const fixed = compile('let total = 0;\nlet next = total + 1;\nprint next;');
    expect(fixed.phases.intermediate.output?.instructions.map(formatInstruction)).toEqual([
      'total = 0', '%t1 = total + 1', 'next = %t1', 'PRINT next',
    ]);
  });

  it('resets temporary numbering on every recompilation', () => {
    const first = compile('print 1 + 2 * 3;');
    const second = compile('print 1 + 2 * 3;');
    expect(second.phases.intermediate.output).toEqual(first.phases.intermediate.output);
    expect(second.phases.intermediate.output?.instructions[0]).toMatchObject({ target: { id: 1 } });
    expect(second.phases.intermediate.output).not.toBe(first.phases.intermediate.output);
  });
});
