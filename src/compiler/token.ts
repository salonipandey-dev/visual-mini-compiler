/**
 * token.ts — what a token looks like, plus the lexical tables of the language.
 *
 * ASSUMPTION (until the Language Specification is supplied): a small C-like
 * language with int / float / bool variables, if-else, while and print.
 * Changing the language's vocabulary should only require editing this file.
 */

export type TokenType =
  | 'KEYWORD'
  | 'IDENTIFIER'
  | 'INT_LITERAL'
  | 'FLOAT_LITERAL'
  | 'BOOL_LITERAL'
  | 'OPERATOR'
  | 'DELIMITER'
  | 'ERROR' // a piece of source the lexer could not turn into a valid token
  | 'EOF'; // end of input — always the last token

export interface Token {
  type: TokenType;
  /** The exact characters from the source, e.g. "while" or "<=". */
  lexeme: string;
  /** 1-based line of the first character. */
  line: number;
  /** 1-based column of the first character (a tab counts as one column). */
  column: number;
  /** 0-based index of the first character in the source string. */
  offset: number;
}

/** Reserved words: these can never be used as variable names. */
export const KEYWORDS: ReadonlySet<string> = new Set([
  'int',
  'float',
  'bool',
  'if',
  'else',
  'while',
  'print',
]);

/** `true` and `false` look like words but are literal values. */
export const BOOL_LITERALS: ReadonlySet<string> = new Set(['true', 'false']);

/**
 * Two-character operators. The lexer checks these BEFORE the one-character
 * operators so that "<=" becomes one token, not "<" followed by "=".
 */
export const TWO_CHAR_OPERATORS: ReadonlySet<string> = new Set([
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
]);

export const ONE_CHAR_OPERATORS: ReadonlySet<string> = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '=',
  '<',
  '>',
  '!',
]);

export const DELIMITERS: ReadonlySet<string> = new Set(['(', ')', '{', '}', ';', ',']);
