/**
 * Example programs for the editor's "Examples" menu.
 *
 * `expect` records which phase SHOULD fail (or null if the program should
 * pass every phase built so far). tests/examples.test.ts checks every
 * example against the real compiler, so this list cannot drift out of date.
 */
import type { PhaseId } from '../compiler';

export interface Example {
  id: string;
  title: string;
  /** How the menu groups it: a correct program, or one written to show an error. */
  kind: 'valid' | 'invalid';
  /** Which phase should report an error with the phases built SO FAR, or null. */
  expect: PhaseId | null;
  source: string;
}

export const EXAMPLES: readonly Example[] = [
  {
    id: 'arithmetic',
    title: 'Variables and arithmetic',
    kind: 'valid',
    expect: null,
    source: `// Declare variables and compute an average
int a = 10;
int b = 20;
float avg = (a + b) / 2.0;
print(avg);
`,
  },
  {
    id: 'if-else',
    title: 'If / else with conditions',
    kind: 'valid',
    expect: null,
    source: `int marks = 72;
bool passed = marks >= 40;

if (passed && marks < 75) {
    print(marks);
} else {
    print(0);
}
`,
  },
  {
    id: 'while',
    title: 'While loop (factorial)',
    kind: 'valid',
    expect: null,
    source: `/* Compute 5! with a while loop */
int n = 5;
int fact = 1;
while (n > 1) {
    fact = fact * n;
    n = n - 1;
}
print(fact);
`,
  },
  {
    id: 'lex-illegal-char',
    title: "Illegal character '@'",
    kind: 'invalid',
    expect: 'lexical',
    source: `int price = 250;
int total = 0;
total = price @ 2;   // '@' is not part of the language
print(total);
`,
  },
  {
    id: 'lex-bad-numbers',
    title: 'Malformed numbers',
    kind: 'invalid',
    expect: 'lexical',
    source: `int 9lives = 9;
float rate = 12.;
float pi = 3.14.15;
`,
  },
  {
    id: 'lex-single-ampersand',
    title: "Single '&' instead of '&&'",
    kind: 'invalid',
    expect: 'lexical',
    source: `int age = 19;
bool adult = age >= 18 & age < 60;
print(adult);
`,
  },
  {
    id: 'lex-unterminated-comment',
    title: 'Unterminated comment',
    kind: 'invalid',
    expect: 'lexical',
    source: `int x = 1;
/* this comment is never closed
print(x);
`,
  },
  {
    id: 'grammar-missing-semicolon',
    title: 'Missing semicolon (passes the lexer)',
    kind: 'invalid',
    // Every character is a legal token, so the LEXER accepts this.
    // The missing ';' after "int y = 5" is the parser's job: in checkpoint 2
    // this example's `expect` changes to 'syntax'.
    expect: null,
    source: `int y = 5
print(y);
`,
  },
];

export const DEFAULT_EXAMPLE = EXAMPLES[0];
