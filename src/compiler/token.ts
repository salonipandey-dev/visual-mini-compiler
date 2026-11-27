/** Token vocabulary for the documented integer-only .mcl language. */
export type TokenType =
  | 'KEYWORD'
  | 'IDENTIFIER'
  | 'INT_LITERAL'
  | 'OPERATOR'
  | 'DELIMITER'
  | 'ERROR'
  | 'EOF';

export interface Token {
  readonly type: TokenType;
  readonly lexeme: string;
  readonly line: number;
  readonly column: number;
  /** UTF-16 source index, matching textarea selection offsets. */
  readonly offset: number;
}

export const KEYWORDS: ReadonlySet<string> = new Set(['let', 'print']);
export const ONE_CHAR_OPERATORS: ReadonlySet<string> = new Set(['+', '-', '*', '=']);
export const DELIMITERS: ReadonlySet<string> = new Set(['(', ')', ';']);
