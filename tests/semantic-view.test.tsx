import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler';
import { SemanticView } from '../src/ui/SemanticView';

/** Render the Semantic tab for real compiler output. */
function render(source: string, stale = false): string {
  const semantic = compile(source).phases.semantic;
  if (!semantic.output) throw new Error('Expected semantic output.');
  return renderToStaticMarkup(
    <SemanticView
      table={semantic.output}
      status={semantic.status}
      diagnostics={semantic.diagnostics}
      stale={stale}
      selectedIndex={null}
      onSelect={() => {}}
    />,
  );
}

/** The text of each table body row, cell by cell. */
function rows(html: string): string[][] {
  const body = html.split('<tbody>')[1]?.split('</tbody>')[0] ?? '';
  return body.split('</tr>').filter((row) => row.includes('<td')).map((row) =>
    [...row.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((cell) => cell[1].replace(/<[^>]+>/g, '')));
}

describe('semantic view', () => {
  it('renders the real symbol table in declaration order without values', () => {
    const html = render('let marks = 70;\nlet bonus = 5;\nprint marks + bonus;');
    expect(html).toContain('Semantic analysis passed');
    expect(html).toContain('does not run the program');
    expect(html).toContain('>Symbol table<');
    expect(html).not.toContain('Partial');
    expect(rows(html)).toEqual([
      ['1', 'marks', 'integer', '1', '5'],
      ['2', 'bonus', 'integer', '2', '5'],
    ]);
    expect(html).not.toContain('>70<');
    expect(html).not.toContain('Value');
  });

  it('labels the table as partial after a semantic error', () => {
    const html = render('let score = 10;\nlet score = 20;');
    expect(html).toContain('Partial symbol table');
    expect(html).toContain('stopped at its first error (line 2, column 5)');
    expect(html).toContain('already declared at line 1, column 5');
    expect(rows(html)).toEqual([['1', 'score', 'integer', '1', '5']]);
  });

  it('explains an empty partial table', () => {
    const html = render('print missing;');
    expect(html).toContain('Partial symbol table');
    expect(html).toContain('No declarations were checked before the error.');
    expect(html).not.toContain('<table');
  });

  it('explains an empty complete table', () => {
    const html = render('# nothing declared\nprint 1;');
    expect(html).toContain('This program declares no variables');
    expect(html).toContain('0 symbols in one global scope');
  });

  it('escapes and shows unusual names such as __proto__ and constructor', () => {
    const html = render('let __proto__ = 1; let constructor = 2;');
    expect(rows(html).map((row) => row[1])).toEqual(['__proto__', 'constructor']);
  });

  it('disables source links for stale results', () => {
    const html = render('let a = 1;', true);
    expect(html).toContain('disabled=""');
  });
});
