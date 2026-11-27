import { describe, expect, it } from 'vitest';
import { tokenize, type Token } from '../src/compiler';

const show = (tokens: readonly Token[]): string[] =>
  tokens.map((t) => t.type + ' ' + t.lexeme + ' @' + t.line + ':' + t.column);

describe('documented .mcl lexical rules', () => {
  it('tokenizes a let declaration with exact positions and EOF', () => {
    const result = tokenize('let total = 12 + 3;');
    expect(result.diagnostics).toEqual([]);
    expect(show(result.tokens)).toEqual([
      'KEYWORD let @1:1', 'IDENTIFIER total @1:5', 'OPERATOR = @1:11',
      'INT_LITERAL 12 @1:13', 'OPERATOR + @1:16', 'INT_LITERAL 3 @1:18',
      'DELIMITER ; @1:19', 'EOF  @1:20',
    ]);
  });

  it('recognizes only complete lowercase keywords', () => {
    expect(tokenize('let letter print print2 LET _total7').tokens.map((t) => t.type)).toEqual([
      'KEYWORD', 'IDENTIFIER', 'KEYWORD', 'IDENTIFIER', 'IDENTIFIER', 'IDENTIFIER', 'EOF',
    ]);
  });

  it('keeps leading zero spelling and a separate unary-minus token', () => {
    expect(tokenize('-0007').tokens.map((t) => [t.type, t.lexeme])).toEqual([
      ['OPERATOR', '-'], ['INT_LITERAL', '0007'], ['EOF', ''],
    ]);
  });

  it('uses # comments, including Unicode comment text, and counts lines', () => {
    const result = tokenize('# header 😀\nlet x = 1; # note\nprint x;');
    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.find((t) => t.lexeme === 'let')).toMatchObject({ line: 2, column: 1 });
    expect(result.tokens.find((t) => t.lexeme === 'print')).toMatchObject({ line: 3, column: 1 });
  });

  it('normalizes both CRLF and lone CR before positions are recorded', () => {
    const unix = tokenize('let a = 1;\nprint a;');
    for (const source of ['let a = 1;\r\nprint a;', 'let a = 1;\rprint a;']) {
      const result = tokenize(source);
      expect(result.source).toBe(unix.source);
      expect(result.tokens).toEqual(unix.tokens);
    }
  });

  it.each(['', '  \n\t', '# comment only'])('accepts empty or ignored source: %j', (source) => {
    const result = tokenize(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.map((t) => t.type)).toEqual(['EOF']);
  });

  it('preserves offsets into the normalized source', () => {
    const result = tokenize('let a = 1;\r\nprint a;');
    for (const token of result.tokens) {
      expect(result.source.slice(token.offset, token.offset + token.lexeme.length)).toBe(token.lexeme);
    }
  });

  it('splits digit-led text into integer and name for the parser to reject', () => {
    const result = tokenize('123abc');
    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.map((t) => [t.type, t.lexeme])).toEqual([
      ['INT_LITERAL', '123'], ['IDENTIFIER', 'abc'], ['EOF', ''],
    ]);
  });

  it.each(['/', '%', '.', '{', '}', ',', '&', '|', '!', '"', '\u00a0'])(
    'rejects unsupported source character %j', (character) => {
      const result = tokenize('print 2 ' + character + ' 3;');
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]).toMatchObject({ phase: 'lexical', line: 1, column: 9, found: character });
    },
  );

  it('stops at the first lexical error while positioning EOF at the real end', () => {
    const result = tokenize('print 2 @ 3;\nprint $;');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].found).toBe('@');
    expect(result.tokens.map((t) => t.type)).toEqual(['KEYWORD', 'INT_LITERAL', 'ERROR', 'EOF']);
    expect(result.tokens.at(-1)).toMatchObject({ offset: result.source.length, line: 2, column: 9 });
  });

  it('accepts 100 literal digits and rejects 101 before conversion', () => {
    expect(tokenize('9'.repeat(100)).diagnostics).toEqual([]);
    expect(tokenize('9'.repeat(101)).diagnostics[0]).toMatchObject({ phase: 'lexical', line: 1, column: 1 });
  });

  it('reports an emoji once using code-point columns and UTF-16 selection length', () => {
    expect(tokenize('print 😀;').diagnostics[0]).toMatchObject({ column: 7, offset: 6, length: 2 });
  });

  it('does not consume the following character for an unpaired surrogate', () => {
    expect(tokenize('print \uD800;').diagnostics[0]).toMatchObject({ found: '\uD800', length: 1 });
  });

  it('accepts 5000 normalized characters and rejects the first extra one', () => {
    expect(tokenize(' '.repeat(5000)).diagnostics).toEqual([]);
    expect(tokenize(' '.repeat(5001)).diagnostics[0]).toMatchObject({
      phase: 'input', offset: 5000, line: 1, column: 5001,
    });
  });

  it('counts Unicode characters rather than UTF-16 units in comment input limits', () => {
    expect(tokenize('#' + '😀'.repeat(4999)).diagnostics).toEqual([]);
    expect(tokenize('#' + '😀'.repeat(5000)).diagnostics[0]).toMatchObject({
      phase: 'input', offset: 9999, column: 5001,
    });
  });
});
