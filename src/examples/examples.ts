import type { PhaseId } from '../compiler';

export interface Example {
  readonly id: string;
  readonly title: string;
  readonly kind: 'valid' | 'invalid';
  /** The phase that should fail, or null when every implemented phase accepts it. */
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
    id: 'case-sensitive', title: 'Case-sensitive names', kind: 'valid', expect: null,
    source: '# total and Total are different variables\nlet total = 1;\nlet Total = 2;\nprint total + Total;\n',
  },
  {
    id: 'semantic-undeclared', title: 'Undeclared variable', kind: 'invalid', expect: 'semantic',
    source: 'let marks = 70;\nprint marks + missing;\n',
  },
  {
    id: 'semantic-use-before-declaration', title: 'Used before its declaration', kind: 'invalid', expect: 'semantic',
    source: 'print rate * 2;\nlet rate = 5;\n',
  },
  {
    id: 'semantic-self-reference', title: 'Variable in its own initializer', kind: 'invalid', expect: 'semantic',
    source: 'let total = total + 1;\n',
  },
  {
    id: 'semantic-duplicate', title: 'Duplicate declaration', kind: 'invalid', expect: 'semantic',
    source: 'let score = 10;\nlet score = 20;\nprint score;\n',
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
