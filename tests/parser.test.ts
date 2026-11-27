import { describe, expect, it } from 'vitest';
import {
  parse, tokenize, type Program, type Expression, type BinaryExpression,
} from '../src/compiler';

function program(source: string): Program {
  const lex = tokenize(source);
  expect(lex.diagnostics).toEqual([]);
  const parsed = parse(lex.tokens);
  expect(parsed.diagnostics).toEqual([]);
  if (!parsed.ast) throw new Error('Expected a parsed Program.');
  return parsed.ast;
}

function expression(source: string): Expression {
  const statement = program('print ' + source + ';').statements[0];
  if (statement.kind !== 'PrintStatement') throw new Error('Expected print statement.');
  return statement.expression;
}

function binary(node: Expression): BinaryExpression {
  if (node.kind !== 'BinaryExpression') throw new Error('Expected binary expression.');
  return node;
}

describe('recursive-descent parser', () => {
  it('builds declaration and print nodes with declaration positions', () => {
    const ast = program('let marks = 70;\nlet bonus = 5;\nprint marks + bonus;');
    expect(ast.statements.map((s) => s.kind)).toEqual(['LetDeclaration', 'LetDeclaration', 'PrintStatement']);
    expect(ast.statements[0]).toMatchObject({ name: 'marks', nameSpan: { line: 1, column: 5 } });
    expect(ast.statements[1]).toMatchObject({ name: 'bonus', nameSpan: { line: 2, column: 5 } });
  });

  it.each(['', '# only a comment'])('accepts a valid empty program: %j', (source) => {
    expect(program(source).statements).toEqual([]);
  });

  it('places multiplication beneath addition', () => {
    const node = binary(expression('2 + 3 * 4'));
    expect(node.operator).toBe('+');
    expect(node.left).toMatchObject({ kind: 'IntegerLiteral', value: '2' });
    expect(binary(node.right).operator).toBe('*');
  });

  it('preserves parenthesized grouping with precise source spans', () => {
    const node = binary(expression('(2 + 3) * 4'));
    expect(node.operator).toBe('*');
    expect(node.left).toMatchObject({
      kind: 'GroupingExpression', span: { line: 1, column: 7, length: 7 },
      expression: { kind: 'BinaryExpression', operator: '+' },
    });
  });

  it('builds subtraction from the left', () => {
    const node = binary(expression('20 - 5 - 3'));
    expect(node.operator).toBe('-');
    expect(binary(node.left)).toMatchObject({ operator: '-', left: { value: '20' }, right: { value: '5' } });
    expect(node.right).toMatchObject({ value: '3' });
  });

  it('builds multiplication from the left', () => {
    const node = binary(expression('2 * 3 * 4'));
    expect(node.operator).toBe('*');
    expect(binary(node.left).operator).toBe('*');
  });

  it('binds unary minus before multiplication', () => {
    expect(binary(expression('-3 * 2')).left).toMatchObject({
      kind: 'UnaryExpression', argument: { kind: 'IntegerLiteral', value: '3' },
    });
  });

  it('supports nested unary minus and subtraction of a negative', () => {
    expect(expression('--3')).toMatchObject({ kind: 'UnaryExpression', argument: { kind: 'UnaryExpression' } });
    expect(binary(expression('3--2')).right).toMatchObject({ kind: 'UnaryExpression' });
  });

  it('allows print followed by a parenthesized expression', () => {
    expect(program('print(7);').statements[0]).toMatchObject({
      kind: 'PrintStatement', expression: { kind: 'GroupingExpression' },
    });
  });

  it('preserves exact 100-digit integers and canonicalizes leading zeroes', () => {
    const digits = '9'.repeat(100);
    expect(expression(digits)).toMatchObject({ value: digits, raw: digits });
    expect(expression('0007')).toMatchObject({ value: '7', raw: '0007' });
  });

  it('retains the operator position separately from the whole expression', () => {
    const node = binary(expression('2 + 3 * 4'));
    expect(node.operatorSpan).toMatchObject({ line: 1, column: 9, offset: 8, length: 1 });
    expect(binary(node.right).operatorSpan).toMatchObject({ line: 1, column: 13 });
  });

  it.each([
    ['print 2 + ;', 11], ['print (2 + 3;', 13], ['print 2', 8],
    ['print +2;', 7], ['let 2marks = 4;', 5], ['x = 2;', 1],
    ['print 2(3);', 8], ['let x 2;', 7], ['let x = ;', 9],
    ['print 1; garbage', 10], ['print 123abc;', 10],
  ])('rejects malformed source %j at column %i', (source, column) => {
    const lex = tokenize(source);
    expect(lex.diagnostics).toEqual([]);
    const parsed = parse(lex.tokens);
    expect(parsed.ast).toBeNull();
    expect(parsed.diagnostics).toHaveLength(1);
    expect(parsed.diagnostics[0]).toMatchObject({ phase: 'syntax', line: 1, column });
  });

  it.each(['print missing;', 'let x = x + 1;', 'let x = 1; let x = 2;'])(
    'leaves semantic checks to the later phase: %j', (source) => {
      expect(program(source).kind).toBe('Program');
    },
  );

  it('accepts 50 parenthesis levels and rejects 51 without a stack overflow', () => {
    expect(expression('('.repeat(50) + '1' + ')'.repeat(50)).depth).toBe(1);
    const lex = tokenize('print ' + '('.repeat(51) + '1' + ')'.repeat(51) + ';');
    expect(parse(lex.tokens).diagnostics[0].message).toContain('nesting limit');
  });

  it('enforces AST operator depth for flat binary chains', () => {
    expect(expression(Array(50).fill('1').join('+')).depth).toBe(50);
    const lex = tokenize('print ' + Array(51).fill('1').join('+') + ';');
    expect(parse(lex.tokens).diagnostics[0].message).toContain('depth limit');
  });

  it('enforces operator depth for unary chains', () => {
    expect(expression('-'.repeat(49) + '1').depth).toBe(50);
    const lex = tokenize('print ' + '-'.repeat(50) + '1;');
    expect(parse(lex.tokens).diagnostics[0].message).toContain('depth limit');
  });

  it('counts combined grouping and unary nesting', () => {
    expect(expression('-'.repeat(25) + '('.repeat(25) + '1' + ')'.repeat(25)).depth).toBe(26);
    const lex = tokenize('print ' + '-'.repeat(25) + '('.repeat(26) + '1' + ')'.repeat(26) + ';');
    expect(parse(lex.tokens).diagnostics[0].message).toContain('nesting limit');
  });

  it('freezes the AST, its statement collection, and source spans', () => {
    const ast = program('print 1;');
    expect(Object.isFrozen(ast)).toBe(true);
    expect(Object.isFrozen(ast.statements)).toBe(true);
    expect(Object.isFrozen(ast.statements[0])).toBe(true);
    expect(Object.isFrozen(ast.statements[0].span)).toBe(true);
  });
});
