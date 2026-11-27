/**
 * Phase 1: scan the integer-only .mcl language.
 * Stop at the first lexical error; the pipeline never parses failed tokenization.
 */
import type { Diagnostic } from './diagnostics';
import { MAX_LITERAL_DIGITS, normalizeSource, sourceLimitDiagnostic } from './source';
import { DELIMITERS, KEYWORDS, ONE_CHAR_OPERATORS, type Token, type TokenType } from './token';

export interface LexResult {
  readonly source: string;
  readonly tokens: readonly Token[];
  readonly diagnostics: readonly Diagnostic[];
}

export function tokenize(source: string): LexResult {
  const normalized = normalizeSource(source);
  const inputError = sourceLimitDiagnostic(normalized);
  if (inputError) return { source: normalized, tokens: [], diagnostics: [inputError] };
  return new Lexer(normalized).run();
}

interface Mark {
  offset: number;
  line: number;
  column: number;
}

const isDigit = (c: string): boolean => c >= '0' && c <= '9';
const isLetter = (c: string): boolean => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isIdentStart = (c: string): boolean => isLetter(c) || c === '_';
const isIdentChar = (c: string): boolean => isIdentStart(c) || isDigit(c);

class Lexer {
  private pos = 0;
  private line = 1;
  private column = 1;
  private readonly tokens: Token[] = [];
  private readonly diagnostics: Diagnostic[] = [];

  private readonly src: string;

  constructor(src: string) { this.src = src; }

  run(): LexResult {
    while (!this.atEnd()) {
      this.skipWhitespaceAndComments();
      if (this.atEnd()) break;
      this.scanToken();
      if (this.diagnostics.length > 0) break;
    }
    // Position EOF at the actual end even when tokenization stopped early.
    while (!this.atEnd()) this.advance();
    this.tokens.push({ type: 'EOF', lexeme: '', ...this.mark() });
    return { source: this.src, tokens: this.tokens, diagnostics: this.diagnostics };
  }

  private scanToken(): void {
    const start = this.mark();
    const ch = this.advance();
    if (isIdentStart(ch)) {
      while (isIdentChar(this.peek())) this.advance();
      const word = this.textFrom(start);
      this.addToken(KEYWORDS.has(word) ? 'KEYWORD' : 'IDENTIFIER', start);
      return;
    }
    if (isDigit(ch)) {
      while (isDigit(this.peek())) this.advance();
      if (this.pos - start.offset > MAX_LITERAL_DIGITS) {
        this.error(start, 'Integer literals may contain at most ' + MAX_LITERAL_DIGITS + ' digits.');
      } else {
        this.addToken('INT_LITERAL', start);
      }
      return;
    }
    if (ONE_CHAR_OPERATORS.has(ch)) return this.addToken('OPERATOR', start);
    if (DELIMITERS.has(ch)) return this.addToken('DELIMITER', start);
    this.error(start, 'Unexpected character ' + describeChar(ch));
  }

  private skipWhitespaceAndComments(): void {
    while (!this.atEnd()) {
      const ch = this.peek();
      if (ch === ' ' || ch === '\t' || ch === '\n') {
        this.advance();
      } else if (ch === '#') {
        while (!this.atEnd() && this.peek() !== '\n') this.advance();
      } else {
        return;
      }
    }
  }

  private atEnd(): boolean {
    return this.pos >= this.src.length;
  }

  private peek(): string {
    const code = this.src.codePointAt(this.pos);
    return code === undefined ? '' : String.fromCodePoint(code);
  }

  private advance(): string {
    const ch = this.peek();
    if (!ch) return '';
    this.pos += ch.length;
    if (ch === '\n') {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
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

  private error(start: Mark, message: string): void {
    const lexeme = this.textFrom(start);
    this.tokens.push({ type: 'ERROR', lexeme, ...start });
    this.diagnostics.push({
      phase: 'lexical', severity: 'error', message, ...start, length: lexeme.length, found: lexeme,
    });
  }
}

function describeChar(ch: string): string {
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 0x21 && code <= 0x7e) return "'" + ch + "'";
  return "'" + ch + "' (U+" + code.toString(16).toUpperCase().padStart(4, '0') + ')';
}
