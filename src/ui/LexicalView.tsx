/**
 * LexicalView — the lexer's real output: one row per token.
 * Picking a row highlights that token's characters in the editor (gold).
 */
import type { PhaseStatus, Token, TokenType } from '../compiler';

interface Props {
  tokens: readonly Token[];
  status: PhaseStatus;
  errorCount: number;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

const SUMMARY_ORDER: TokenType[] = [
  'KEYWORD',
  'IDENTIFIER',
  'INT_LITERAL',
  'FLOAT_LITERAL',
  'BOOL_LITERAL',
  'OPERATOR',
  'DELIMITER',
  'ERROR',
];

export function LexicalView({ tokens, status, errorCount, selectedIndex, onSelect }: Props) {
  const counts = new Map<TokenType, number>();
  for (const t of tokens) counts.set(t.type, (counts.get(t.type) ?? 0) + 1);

  return (
    <div className="lexical">
      {status === 'error' && (
        <p className="phase-banner banner-error">
          The lexer found {errorCount === 1 ? '1 error' : `${errorCount} errors`}. It skipped each bad
          piece of text, kept scanning, and listed it below as an ERROR token. Syntax and semantic
          analysis were skipped.
        </p>
      )}

      <div className="token-summary" aria-label="Token counts by type">
        {SUMMARY_ORDER.filter((type) => counts.has(type)).map((type) => (
          <span key={type} className={`tok tok-${type}`}>
            {type} <b>{counts.get(type)}</b>
          </span>
        ))}
        <span className="token-total">
          {tokens.length === 1 ? '1 token' : `${tokens.length} tokens`} including EOF
        </span>
      </div>

      <div className="table-scroll">
        <table className="token-table">
          <caption className="sr-only">
            Tokens produced by the lexer, in source order. Select a lexeme to highlight it in the
            editor.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="num">#</th>
              <th scope="col" className="col-type">Type</th>
              <th scope="col">Lexeme</th>
              <th scope="col" className="num">Line</th>
              <th scope="col" className="num">Col</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t, i) => (
              <tr
                key={i}
                className={[
                  t.type === 'ERROR' ? 'row-error' : '',
                  i === selectedIndex ? 'row-selected' : '',
                ].join(' ')}
              >
                <td className="num muted">{i + 1}</td>
                <td>
                  <span className={`tok tok-${t.type}`}>{t.type}</span>
                </td>
                <td>
                  <button
                    type="button"
                    className="lexeme"
                    aria-pressed={i === selectedIndex}
                    onClick={() => onSelect(i)}
                  >
                    {t.type === 'EOF' ? <span className="muted">end of input</span> : showLexeme(t.lexeme)}
                  </button>
                </td>
                <td className="num">{t.line}</td>
                <td className="num">{t.column}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Make invisible characters (like a non-breaking space) visible in the table. */
function showLexeme(lexeme: string): string {
  return lexeme.replace(/[  -​　﻿]/g, (c) => `␣U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
}
