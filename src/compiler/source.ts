import type { Diagnostic } from './diagnostics';

export const MAX_SOURCE_CHARACTERS = 5_000;
export const MAX_LITERAL_DIGITS = 100;
export const MAX_EXPRESSION_DEPTH = 50;
export const MAX_SYNTAX_NESTING = 50;

export function normalizeSource(source: string): string {
  return source.replace(/\r\n?/g, '\n');
}

/** Count Unicode characters while preserving UTF-16 offsets used by the editor. */
export function sourceLimitDiagnostic(source: string): Diagnostic | null {
  let count = 0;
  let offset = 0;
  let line = 1;
  let column = 1;
  for (const character of source) {
    if (count === MAX_SOURCE_CHARACTERS) {
      return {
        phase: 'input',
        severity: 'error',
        message: 'Source exceeds the ' + MAX_SOURCE_CHARACTERS + '-character limit.',
        offset,
        length: character.length,
        line,
        column,
        expected: 'at most ' + MAX_SOURCE_CHARACTERS + ' normalized source characters',
        found: character,
      };
    }
    count += 1;
    offset += character.length;
    if (character === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return null;
}
