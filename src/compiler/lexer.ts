/**
 * lexer.ts — Phase 1: Lexical analysis.
 *
 *   input:  source code (a string)
 *   output: a list of tokens + a list of lexical diagnostics
 *
 * The lexer reads the source ONE CHARACTER AT A TIME, from left to right.
 * At each step it looks at the current character and decides which kind of
 * token is starting (word, number, operator, delimiter...). It then keeps
 * reading for as long as the characters still belong to that token — the
 * "longest match" (maximal munch) rule.
 *
 * When it meets something illegal it records a Diagnostic, skips the bad
 * characters, and carries on, so one compile reports every lexical error.
 */

import type { Diagnostic } from './diagnostics';
import {
  BOOL_LITERALS,
  DELIMITERS,
  KEYWORDS,
  ONE_CHAR_OPERATORS,
  TWO_CHAR_OPERATORS,
  type Token,
  type TokenType,
} from './token';

export interface LexResult {
  tokens: Token[];
  diagnostics: Diagnostic[];
}

/** Public entry point: turn source text into tokens. */
export function tokenize(source: string): LexResult {
  return new Lexer(source).run();
}

/** A saved position: where the token currently being scanned started. */
interface Mark {
  offset: number;
  line: number;
  column: number;
}

// ---- character classes (ASCII only, by design) ----
const isDigit = (c: string): boolean => c >= '0' && c <= '9';
const isLetter = (c: string): boolean => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isIdentStart = (c: string): boolean => isLetter(c) || c === '_';
const isIdentChar = (c: string): boolean => isIdentStart(c) || isDigit(c);
const isHighSurrogate = (c: string): boolean => c >= '\uD800' && c <= '\uDBFF';

class Lexer {
  private readonly src: string;
  private pos = 0; // index of the NEXT character to read
  private line = 1;
  private column = 1;
  private readonly tokens: Token[] = [];
  private readonly diagnostics: Diagnostic[] = [];

  constructor(source: string) {
    this.src = source;
  }

  run(): LexResult {
    for (;;) {
      this.skipWhitespaceAndComments();
      if (this.atEnd()) break;
      this.scanToken();
    }
    // EOF marks "no more input"; the parser will rely on it in checkpoint 2.
    this.tokens.push({ type: 'EOF', lexeme: '', ...this.mark() });
    return { tokens: this.tokens, diagnostics: this.diagnostics };
  }

  // ------------------------------------------------------------------
  // Scanning one token
  // ------------------------------------------------------------------

  private scanToken(): void {
    const start = this.mark();
    const ch = this.advance();

    if (isIdentStart(ch)) return this.wordToken(start);
    if (isDigit(ch)) return this.numberToken(start);

    // Maximal munch: try the two-character operator first ("<=" before "<").
    if (TWO_CHAR_OPERATORS.has(ch + this.peek())) {
      this.advance();
      return this.addToken('OPERATOR', start);
    }
    // A single '&' or '|' is not an operator in this language.
    if (ch === '&' || ch === '|') {
      return this.error(start, `Unexpected character '${ch}'`, `'${ch}${ch}'`);
    }
    if (ONE_CHAR_OPERATORS.has(ch)) return this.addToken('OPERATOR', start);
    if (DELIMITERS.has(ch)) return this.addToken('DELIMITER', start);

    // Anything else is not part of the language (e.g. @ # $ " or smart quotes).
    // An emoji is stored as TWO UTF-16 code units; consume both so we report it once.
    if (isHighSurrogate(ch)) this.advance();
    this.error(start, `Unexpected character ${describeChar(this.textFrom(start))}`);
  }

  /** Identifier, keyword, or true/false. */
  private wordToken(start: Mark): void {
    while (isIdentChar(this.peek())) this.advance();
    const word = this.textFrom(start);

    // Read the WHOLE word first, then look it up. So "whilex" is an identifier,
    // not the keyword "while" followed by "x".
    let type: TokenType = 'IDENTIFIER';
    if (KEYWORDS.has(word)) type = 'KEYWORD';
    else if (BOOL_LITERALS.has(word)) type = 'BOOL_LITERAL';
    this.addToken(type, start);
  }

  /** Integer (42) or float (3.14). */
  private numberToken(start: Mark): void {
    while (isDigit(this.peek())) this.advance();
    let type: TokenType = 'INT_LITERAL';

    if (this.peek() === '.') {
      if (isDigit(this.peekNext())) {
        this.advance(); // the '.'
        while (isDigit(this.peek())) this.advance();
        type = 'FLOAT_LITERAL';
      } else {
        this.advance(); // include the '.' in the error, e.g. "12."
        return this.error(
          start,
          `Malformed number '${this.textFrom(start)}'`,
          "a digit after '.'",
        );
      }
    }

    // A number must not run straight into letters, '_' or another '.':
    // "9lives" and "1.2.3" are each ONE bad lexeme, reported once.
    if (isIdentChar(this.peek()) || this.peek() === '.') {
      while (isIdentChar(this.peek()) || this.peek() === '.') this.advance();
      const text = this.textFrom(start);
      const startsLikeName = /[A-Za-z_]/.test(text);
      return this.error(
        start,
        startsLikeName
          ? `Invalid token '${text}': a name cannot start with a digit`
          : `Malformed number '${text}': a number can contain only one '.'`,
        startsLikeName ? 'a name that starts with a letter or _' : 'a number like 1.25',
      );
    }

    this.addToken(type, start);
  }

  // ------------------------------------------------------------------
  // Whitespace and comments: skipped, they never become tokens
  // ------------------------------------------------------------------

  private skipWhitespaceAndComments(): void {
    for (;;) {
      const ch = this.peek();
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        this.advance();
      } else if (ch === '/' && this.peekNext() === '/') {
        // line comment: skip to the end of the line
        while (!this.atEnd() && this.peek() !== '\n') this.advance();
      } else if (ch === '/' && this.peekNext() === '*') {
        this.skipBlockComment();
      } else {
        return;
      }
    }
  }

  private skipBlockComment(): void {
    const start = this.mark();
    this.advance(); // '/'
    this.advance(); // '*'
    while (!this.atEnd()) {
      if (this.peek() === '*' && this.peekNext() === '/') {
        this.advance();
        this.advance();
        return;
      }
      this.advance();
    }
    // Reached the end of the file without finding "*/".
    this.diagnostics.push({
      phase: 'lexical',
      severity: 'error',
      message: "Unterminated comment: '/*' is never closed",
      ...start,
      length: 2,
      expected: "'*/' before the end of the program",
      found: 'end of input',
    });
  }

  // ------------------------------------------------------------------
  // Small helpers
  // ------------------------------------------------------------------

  private atEnd(): boolean {
    return this.pos >= this.src.length;
  }

  /** Look at the current character without consuming it ('' at the end). */
  private peek(): string {
    return this.src.charAt(this.pos);
  }

  private peekNext(): string {
    return this.src.charAt(this.pos + 1);
  }

  /** Consume one character and keep line/column up to date. */
  private advance(): string {
    const ch = this.src.charAt(this.pos);
    this.pos++;
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else if (ch !== '\r' && !isHighSurrogate(ch)) {
      // '\r' (from Windows "\r\n" line endings) takes no column, and an emoji's
      // first half is not counted separately: the second half counts it.
      this.column++;
    }
    return ch;
  }

  private mark(): Mark {
    return { offset: this.pos, line: this.line, column: this.column };
  }

  private textFrom(start: Mark): string {
    return this.src.slice(start.offset, this.pos);
  }

  private addToken(type: TokenType, start: Mark): void {
    this.tokens.push({ type, lexeme: this.textFrom(start), ...start });
  }

  /** Record a lexical error AND an ERROR token, so the token table shows where it happened. */
  private error(start: Mark, message: string, expected?: string): void {
    const lexeme = this.textFrom(start);
    this.tokens.push({ type: 'ERROR', lexeme, ...start });
    this.diagnostics.push({
      phase: 'lexical',
      severity: 'error',
      message,
      ...start,
      length: lexeme.length,
      expected,
      found: lexeme,
    });
  }
}

/** "'@'" for normal characters; adds the code point for invisible or non-ASCII ones. */
function describeChar(ch: string): string {
  const code = ch.codePointAt(0) ?? 0;
  const isPlainAscii = code >= 0x21 && code <= 0x7e;
  if (isPlainAscii) return `'${ch}'`;
  const hex = code.toString(16).toUpperCase().padStart(4, '0');
  return `'${ch}' (U+${hex})`;
}
