import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { compile, type Program } from '../src/compiler';
import { SyntaxView } from '../src/ui/SyntaxView';

function ast(source: string): Program {
  const result = compile(source);
  if (!result.phases.syntax.output) throw new Error('Expected syntax output.');
  return result.phases.syntax.output;
}

describe('syntax view', () => {
  it('renders the real declarations, operations, and source positions', () => {
    const html = renderToStaticMarkup(<SyntaxView program={ast('let marks = 70; print marks + 5;')} />);
    expect(html).toContain('Let declaration: marks');
    expect(html).toContain('Integer: 70');
    expect(html).toContain('Binary: +');
    expect(html).toContain('Variable: marks');
    expect(html).toContain('Abstract syntax tree');
    expect(html).toContain('The Semantic tab checks its variable declarations; execution is a later phase.');
  });

  it('renders empty programs as valid', () => {
    const html = renderToStaticMarkup(<SyntaxView program={ast('')} />);
    expect(html).toContain('Valid empty program');
    expect(html).toContain('Program');
  });

  it('renders large integers without numeric rounding', () => {
    const value = '9'.repeat(100);
    const html = renderToStaticMarkup(<SyntaxView program={ast('print ' + value + ';')} />);
    expect(html).toContain('Integer: ' + value);
  });

  it('shows parenthesized grouping as a separate tree node', () => {
    const html = renderToStaticMarkup(<SyntaxView program={ast('print (2 + 3) * 4;')} />);
    expect(html).toContain('Grouped expression');
    expect(html).toContain('Binary: *');
    expect(html).toContain('Binary: +');
  });
});
