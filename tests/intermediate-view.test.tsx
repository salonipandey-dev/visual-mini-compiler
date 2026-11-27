import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler';
import { IntermediateView } from '../src/ui/IntermediateView';

/** Render the Intermediate Code tab for real compiler output. */
function render(source: string, stale = false): string {
  const intermediate = compile(source).phases.intermediate;
  if (!intermediate.output) throw new Error('Expected generated instructions.');
  return renderToStaticMarkup(
    <IntermediateView program={intermediate.output} stale={stale} selectedIndex={null} onSelect={() => {}} />,
  );
}

/** Each body row's cells as plain text. */
function rows(html: string): string[][] {
  const body = html.split('<tbody>')[1]?.split('</tbody>')[0] ?? '';
  return body.split('</tr>').filter((row) => row.includes('<td')).map((row) =>
    [...row.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((cell) => cell[1].replace(/<[^>]+>/g, '')));
}

describe('intermediate code view', () => {
  it('lists the generated instructions in order with opcode and source position', () => {
    const html = render('print 2 + 3 * 4;');
    expect(rows(html)).toEqual([
      ['1', '%t1 = 3 * 4', 'MUL', '1', '13'],
      ['2', '%t2 = 2 + %t1', 'ADD', '1', '9'],
      ['3', 'PRINT %t2', 'PRINT', '1', '1'],
    ]);
    expect(html).toContain('3 instructions, 2 temporaries');
  });

  it('labels the instructions as generated but not executed', () => {
    const html = render('let marks = 70;\nprint marks;');
    expect(html).toContain('have not been executed');
    expect(html).toContain('no results or printed output yet');
  });

  it('marks variables and temporaries as different kinds of operand', () => {
    const html = render('let t1 = 7;\nprint t1 + 1;');
    expect(rows(html).map((row) => row[1])).toEqual(['t1 = 7', '%t1 = t1 + 1', 'PRINT %t1']);
    expect(html).toContain('<span class="ir-variable">t1</span>');
    expect(html).toContain('<span class="ir-temporary">%t1</span>');
    expect(html).toContain('<span class="ir-integer">7</span>');
  });

  it('explains an empty instruction list', () => {
    const html = render('# nothing to do');
    expect(html).toContain('the instruction list is empty');
    expect(html).toContain('0 instructions, 0 temporaries');
    expect(html).not.toContain('<table');
  });

  it('shows 100-digit literals exactly', () => {
    const digits = '9'.repeat(100);
    expect(rows(render(`print ${digits};`))[0][1]).toBe('PRINT ' + digits);
  });

  it('disables source links for stale results', () => {
    expect(render('print 1;', true)).toContain('disabled=""');
    expect(render('print 1;', false)).not.toContain('disabled=""');
  });
});
