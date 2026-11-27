import type { PhaseId } from '../compiler';

export interface Example {
  readonly id: string;
  readonly title: string;
  readonly kind: 'valid' | 'invalid';
  /** Expected failure among phases implemented in this checkpoint. */
  readonly expect: PhaseId | null;
  readonly source: string;
}

export const EXAMPLES: readonly Example[] = [
  {
    id: 'marks', title: 'Marks and bonus', kind: 'valid', expect: null,
    source: 'let marks = 70;\nlet bonus = 5;\nprint marks + bonus;\n',
  },
  {
    id: 'precedence', title: 'Precedence and parentheses', kind: 'valid', expect: null,
    source: 'print 2 + 3 * 4;\nprint (2 + 3) * 4;\nprint 20 - 5 - 3;\n',
  },
  {
    id: 'comments', title: 'Declarations and # comments', kind: 'valid', expect: null,
    source: '# A small integer program\nlet first = 10;\nlet second = first + 5;\nprint second;\n',
  },
  {
    id: 'unary', title: 'Unary minus', kind: 'valid', expect: null,
    source: 'print -3 * 2;\nprint -(2 + 3);\nprint --3;\n',
  },
  {
    id: 'lex-illegal-char', title: "Illegal character '@'", kind: 'invalid', expect: 'lexical',
    source: 'let price = 250;\nprint price @ 2;\n',
  },
  {
    id: 'grammar-missing-semicolon', title: 'Missing semicolon', kind: 'invalid', expect: 'syntax',
    source: 'let y = 5\nprint y;\n',
  },
  {
    id: 'grammar-missing-operand', title: 'Missing expression operand', kind: 'invalid', expect: 'syntax',
    source: 'print 2 + ;\n',
  },
  {
    id: 'grammar-missing-parenthesis', title: 'Unclosed parenthesis', kind: 'invalid', expect: 'syntax',
    source: 'print (2 + 3;\n',
  },
  {
    id: 'grammar-declaration-name', title: 'Name beginning with a digit', kind: 'invalid', expect: 'syntax',
    source: 'let 2marks = 4;\n',
  },
];

export const DEFAULT_EXAMPLE = EXAMPLES[0];
