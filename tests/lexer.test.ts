import { describe, expect, it } from 'vitest';
import { tokenize, type Token } from '../src/compiler';

/** Compact view of tokens: "TYPE lexeme @line:col". Makes expectations easy to read. */
const show = (tokens: Token[]): string[] =>
  tokens.map((t) => `${t.type} ${t.lexeme} @${t.line}:${t.column}`);

describe('lexer: valid input', () => {
  it('tokenizes a declaration with exact positions', () => {
    const { tokens, diagnostics } = tokenize('int x = 10;');
    expect(diagnostics).toEqual([]);
    expect(show(tokens)).toEqual([
      'KEYWORD int @1:1',
      'IDENTIFIER x @1:5',
      'OPERATOR = @1:7',
      'INT_LITERAL 10 @1:9',
      'DELIMITER ; @1:11',
      'EOF  @1:12',
    ]);
  });

  it('separates keywords, identifiers and boolean literals', () => {
    const types = tokenize('while whilex _tmp1 true falsey bool').tokens.map((t) => t.type);
    expect(types).toEqual([
      'KEYWORD', // while
      'IDENTIFIER', // whilex  (whole word read first, then looked up)
      'IDENTIFIER', // _tmp1
      'BOOL_LITERAL', // true
      'IDENTIFIER', // falsey
      'KEYWORD', // bool
      'EOF',
    ]);
  });

  it('reads int and float literals', () => {
    const { tokens } = tokenize('0 42 3.14 10.0');
    expect(show(tokens).slice(0, 4)).toEqual([
      'INT_LITERAL 0 @1:1',
      'INT_LITERAL 42 @1:3',
      'FLOAT_LITERAL 3.14 @1:6',
      'FLOAT_LITERAL 10.0 @1:11',
    ]);
  });

  it('uses maximal munch for two-character operators', () => {
    const lexemes = tokenize('a<=b==c!=d>=e&&f||!g').tokens.map((t) => t.lexeme);
    expect(lexemes).toEqual([
      'a', '<=', 'b', '==', 'c', '!=', 'd', '>=', 'e', '&&', 'f', '||', '!', 'g', '',
    ]);
  });

  it('skips line and block comments but keeps counting lines', () => {
    const src = '// header\nint /* inline */ a;\n/* multi\nline */ print(a);';
    const { tokens, diagnostics } = tokenize(src);
    expect(diagnostics).toEqual([]);
    expect(show(tokens)).toEqual([
      'KEYWORD int @2:1',
      'IDENTIFIER a @2:18',
      'DELIMITER ; @2:19',
      'KEYWORD print @4:9',
      'DELIMITER ( @4:14',
      'IDENTIFIER a @4:15',
      'DELIMITER ) @4:16',
      'DELIMITER ; @4:17',
      'EOF  @4:18',
    ]);
  });

  it('reports the same positions for Windows (CRLF) line endings', () => {
    const unix = tokenize('int a;\nint b;').tokens;
    const windows = tokenize('int a;\r\nint b;').tokens;
    expect(show(windows)).toEqual(show(unix));
  });

  it('handles empty and whitespace-only input with just an EOF token', () => {
    expect(show(tokenize('').tokens)).toEqual(['EOF  @1:1']);
    const blank = tokenize('  \n\t\n  ');
    expect(blank.diagnostics).toEqual([]);
    expect(show(blank.tokens)).toEqual(['EOF  @3:3']);
  });

  it('records the offset of each token in the source', () => {
    const src = 'int  total;';
    for (const t of tokenize(src).tokens) {
      expect(src.slice(t.offset, t.offset + t.lexeme.length)).toBe(t.lexeme);
    }
  });
});

describe('lexer: errors', () => {
  it('reports an illegal character with line and column', () => {
    const { tokens, diagnostics } = tokenize('int a;\ntotal = price @ 2;');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      phase: 'lexical',
      severity: 'error',
      message: "Unexpected character '@'",
      line: 2,
      column: 15,
      length: 1,
      found: '@',
    });
    // An ERROR token marks the spot in the token table...
    expect(tokens.find((t) => t.type === 'ERROR')).toMatchObject({ lexeme: '@', line: 2, column: 15 });
    // ...and scanning continued after it.
    expect(tokens.map((t) => t.lexeme).slice(-3)).toEqual(['2', ';', '']);
  });

  it('collects every error in one pass instead of stopping at the first', () => {
    const { diagnostics } = tokenize('a = 1 # 2;\nb = $;\nc = 3 ` 4;');
    expect(diagnostics.map((d) => `${d.line}:${d.column} ${d.found}`)).toEqual([
      '1:7 #',
      '2:5 $',
      '3:7 `',
    ]);
  });

  it("suggests '&&' and '||' for a single '&' or '|'", () => {
    const { diagnostics } = tokenize('ok = a & b | c;');
    expect(diagnostics.map((d) => [d.column, d.found, d.expected])).toEqual([
      [8, '&', "'&&'"],
      [12, '|', "'||'"],
    ]);
  });

  it('reports malformed numbers as one lexeme each', () => {
    const { diagnostics } = tokenize('int 9lives = 12.;\nfloat pi = 3.14.15;');
    expect(diagnostics.map((d) => `${d.line}:${d.column} ${d.found}`)).toEqual([
      '1:5 9lives',
      '1:14 12.',
      '2:12 3.14.15',
    ]);
    expect(diagnostics[0].message).toContain('cannot start with a digit');
    expect(diagnostics[1].expected).toBe("a digit after '.'");
    expect(diagnostics[2].message).toContain("only one '.'");
  });

  it('reports an unterminated block comment at the point where it opens', () => {
    const { tokens, diagnostics } = tokenize('int x = 1;\n  /* never closed\nprint(x);');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ line: 2, column: 3, found: 'end of input' });
    // Everything after "/*" was swallowed by the comment.
    expect(tokens.at(-1)?.type).toBe('EOF');
    expect(tokens).toHaveLength(6);
  });

  it('shows the code point of invisible or non-ASCII characters', () => {
    const { diagnostics } = tokenize('x = “hi”; ');
    expect(diagnostics.map((d) => d.message)).toEqual([
      "Unexpected character '“' (U+201C)",
      "Unexpected character '”' (U+201D)",
      "Unexpected character ' ' (U+00A0)",
    ]);
  });

  it('reports an emoji once and keeps later columns correct', () => {
    const { tokens, diagnostics } = tokenize('a = \u{1F600}; b');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ column: 5, length: 2 });
    expect(tokens.find((t) => t.lexeme === 'b')?.column).toBe(8);
  });
});
