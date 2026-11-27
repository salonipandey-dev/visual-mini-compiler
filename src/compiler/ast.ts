import type { Token } from './token';

export interface SourceSpan {
  readonly offset: number;
  readonly length: number;
  readonly line: number;
  readonly column: number;
}

export function tokenSpan(token: Token): SourceSpan {
  return Object.freeze({
    offset: token.offset, length: token.lexeme.length, line: token.line, column: token.column,
  });
}

export function cover(first: SourceSpan, last: SourceSpan): SourceSpan {
  return Object.freeze({
    offset: first.offset,
    length: last.offset + last.length - first.offset,
    line: first.line,
    column: first.column,
  });
}

interface ExpressionBase {
  readonly span: SourceSpan;
  /** Operator depth. Grouping keeps its child's depth and has a separate nesting limit. */
  readonly depth: number;
}

export interface IntegerLiteral extends ExpressionBase {
  readonly kind: 'IntegerLiteral';
  readonly raw: string;
  /** Exact canonical decimal text; never round a 100-digit integer through Number. */
  readonly value: string;
}
export interface Identifier extends ExpressionBase {
  readonly kind: 'Identifier';
  readonly name: string;
}
export interface UnaryExpression extends ExpressionBase {
  readonly kind: 'UnaryExpression';
  readonly operator: '-';
  readonly operatorSpan: SourceSpan;
  readonly argument: Expression;
}
export interface BinaryExpression extends ExpressionBase {
  readonly kind: 'BinaryExpression';
  readonly operator: '+' | '-' | '*';
  readonly operatorSpan: SourceSpan;
  readonly left: Expression;
  readonly right: Expression;
}
export interface GroupingExpression extends ExpressionBase {
  readonly kind: 'GroupingExpression';
  readonly expression: Expression;
}
export type Expression =
  | IntegerLiteral | Identifier | UnaryExpression | BinaryExpression | GroupingExpression;

export interface LetDeclaration {
  readonly kind: 'LetDeclaration';
  readonly name: string;
  readonly nameSpan: SourceSpan;
  readonly initializer: Expression;
  readonly span: SourceSpan;
}
export interface PrintStatement {
  readonly kind: 'PrintStatement';
  readonly expression: Expression;
  readonly span: SourceSpan;
}
export type Statement = LetDeclaration | PrintStatement;

export interface Program {
  readonly kind: 'Program';
  readonly statements: readonly Statement[];
  readonly span: SourceSpan;
}
export type AstNode = Program | Statement | Expression;
