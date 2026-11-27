/** Handwritten recursive-descent parser for the grammar in docs/language-spec.md. */
import {
  cover, tokenSpan, type BinaryExpression, type Expression, type Program, type Statement,
} from './ast';
import type { Diagnostic } from './diagnostics';
import { MAX_EXPRESSION_DEPTH, MAX_SYNTAX_NESTING } from './source';
import type { Token, TokenType } from './token';

export interface ParseResult {
  readonly ast: Program | null;
  readonly diagnostics: readonly Diagnostic[];
}

class ParseFailure extends Error {
  readonly diagnostic: Diagnostic;

  constructor(diagnostic: Diagnostic) {
    super(diagnostic.message);
    this.diagnostic = diagnostic;
    this.name = 'ParseFailure';
  }
}

export function parse(tokens: readonly Token[]): ParseResult {
  if (tokens.length === 0 || tokens[tokens.length - 1].type !== 'EOF') {
    throw new Error('The parser requires a complete token stream ending in EOF.');
  }
  try {
    return { ast: new Parser(tokens).program(), diagnostics: [] };
  } catch (error) {
    if (error instanceof ParseFailure) return { ast: null, diagnostics: [error.diagnostic] };
    throw error;
  }
}

class Parser {
  private current = 0;
  private nesting = 0;

  private readonly tokens: readonly Token[];

  constructor(tokens: readonly Token[]) { this.tokens = tokens; }

  program(): Program {
    const statements: Statement[] = [];
    while (this.peek().type !== 'EOF') statements.push(this.statement());
    const eof = this.peek();
    return Object.freeze({
      kind: 'Program',
      statements: Object.freeze(statements),
      span: Object.freeze({ offset: 0, length: eof.offset, line: 1, column: 1 }),
    });
  }

  private statement(): Statement {
    if (this.is('KEYWORD', 'let')) {
      const start = this.advance();
      const name = this.expectType('IDENTIFIER', 'a variable name after let');
      this.expectLexeme('=');
      const initializer = this.expression();
      const end = this.expectLexeme(';');
      return Object.freeze({
        kind: 'LetDeclaration', name: name.lexeme, nameSpan: tokenSpan(name), initializer,
        span: cover(tokenSpan(start), tokenSpan(end)),
      });
    }
    if (this.is('KEYWORD', 'print')) {
      const start = this.advance();
      const expression = this.expression();
      const end = this.expectLexeme(';');
      return Object.freeze({
        kind: 'PrintStatement', expression, span: cover(tokenSpan(start), tokenSpan(end)),
      });
    }
    return this.fail(this.peek(), "Expected a 'let' declaration or a 'print' statement.", 'let or print');
  }

  private expression(): Expression {
    let left = this.term();
    while (this.is('OPERATOR', '+') || this.is('OPERATOR', '-')) {
      const operator = this.advance();
      left = this.binary(left, operator, this.term());
    }
    return left;
  }

  private term(): Expression {
    let left = this.unary();
    while (this.is('OPERATOR', '*')) {
      const operator = this.advance();
      left = this.binary(left, operator, this.unary());
    }
    return left;
  }

  private binary(left: Expression, token: Token, right: Expression): BinaryExpression {
    const depth = Math.max(left.depth, right.depth) + 1;
    this.checkDepth(depth, token);
    return Object.freeze({
      kind: 'BinaryExpression',
      operator: token.lexeme as '+' | '-' | '*',
      operatorSpan: tokenSpan(token),
      left, right, depth,
      span: cover(left.span, right.span),
    });
  }

  private unary(): Expression {
    if (this.is('OPERATOR', '-')) {
      const operator = this.advance();
      return this.nested(operator, () => {
        const argument = this.unary();
        const depth = argument.depth + 1;
        this.checkDepth(depth, operator);
        return Object.freeze({
          kind: 'UnaryExpression', operator: '-', operatorSpan: tokenSpan(operator),
          argument, depth, span: cover(tokenSpan(operator), argument.span),
        });
      });
    }
    return this.primary();
  }

  private primary(): Expression {
    const token = this.peek();
    if (token.type === 'INT_LITERAL') {
      this.advance();
      return Object.freeze({
        kind: 'IntegerLiteral', raw: token.lexeme, value: BigInt(token.lexeme).toString(),
        span: tokenSpan(token), depth: 1,
      });
    }
    if (token.type === 'IDENTIFIER') {
      this.advance();
      return Object.freeze({
        kind: 'Identifier', name: token.lexeme, span: tokenSpan(token), depth: 1,
      });
    }
    if (this.is('DELIMITER', '(')) {
      const open = this.advance();
      return this.nested(open, () => {
        const expression = this.expression();
        const close = this.expectLexeme(')');
        return Object.freeze({
          kind: 'GroupingExpression', expression, depth: expression.depth,
          span: cover(tokenSpan(open), tokenSpan(close)),
        });
      });
    }
    return this.fail(token, 'Expected an integer, variable name, unary minus, or parenthesized expression.',
      'an expression operand');
  }

  private nested<T>(at: Token, build: () => T): T {
    if (this.nesting >= MAX_SYNTAX_NESTING) {
      return this.fail(at, 'Syntax nesting limit of ' + MAX_SYNTAX_NESTING + ' exceeded.',
        'at most ' + MAX_SYNTAX_NESTING + ' nested parentheses or unary operators');
    }
    this.nesting += 1;
    try {
      return build();
    } finally {
      this.nesting -= 1;
    }
  }

  private checkDepth(depth: number, at: Token): void {
    if (depth > MAX_EXPRESSION_DEPTH) {
      this.fail(at, 'Expression depth limit of ' + MAX_EXPRESSION_DEPTH + ' exceeded.',
        'an expression with depth at most ' + MAX_EXPRESSION_DEPTH);
    }
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private advance(): Token {
    const token = this.peek();
    if (this.current < this.tokens.length - 1) this.current += 1;
    return token;
  }

  private is(type: TokenType, lexeme?: string): boolean {
    return this.peek().type === type && (lexeme === undefined || this.peek().lexeme === lexeme);
  }

  private expectType(type: TokenType, expected: string): Token {
    if (this.is(type)) return this.advance();
    return this.fail(this.peek(), 'Expected ' + expected + '.', expected);
  }

  private expectLexeme(lexeme: string): Token {
    if (this.peek().lexeme === lexeme) return this.advance();
    return this.fail(this.peek(), "Expected '" + lexeme + "'.", "'" + lexeme + "'");
  }

  private fail(token: Token, message: string, expected: string): never {
    throw new ParseFailure({
      phase: 'syntax', severity: 'error', message,
      offset: token.offset, length: token.lexeme.length, line: token.line, column: token.column,
      expected, found: token.type === 'EOF' ? 'end of input' : token.lexeme,
    });
  }
}
