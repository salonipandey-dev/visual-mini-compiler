import { expect, test, type Locator, type Page } from '@playwright/test';

test('compiles source and displays the real syntax tree', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const source = page.getByRole('textbox', { name: 'Source program' });
  await source.fill('let marks = 70;\nlet bonus = 5;\nprint marks + bonus;');
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await page.getByRole('tab', { name: /Syntax/ }).click();
  const tree = page.locator('[aria-label="Abstract syntax tree"]');
  await expect(tree).toContainText('Let declaration: marks');
  await expect(tree).toContainText('Let declaration: bonus');
  await expect(tree).toContainText('Binary: +');
  await page.getByRole('tab', { name: /Semantic/ }).click();
  await expect(page.getByRole('table', { name: 'Symbol table' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('jumps to a syntax problem and recovers after correction', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const source = page.getByRole('textbox', { name: 'Source program' });
  await source.fill('print 2 + ;');
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Syntax analysis failed');
  await page.locator('.problem').first().click();
  const selection = await source.evaluate((element) => ({
    start: (element as HTMLTextAreaElement).selectionStart,
    end: (element as HTMLTextAreaElement).selectionEnd,
  }));
  expect(selection).toEqual({ start: 10, end: 11 });
  await source.fill('print 2 + 3;');
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(page.locator('.problem')).toHaveCount(0);
  await expect(page.locator('[aria-label="Abstract syntax tree"]')).toContainText('Binary: +');
  expect(errors).toEqual([]);
});

test('requires recompilation after an edit followed by Undo', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const source = page.getByRole('textbox', { name: 'Source program' });
  await source.fill('print 1;');
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(page.locator('.stale-banner')).toHaveCount(0);
  await source.focus();
  await source.press('End');
  await source.press('Space');
  await expect(page.locator('.stale-banner')).toBeVisible();
  await source.press('Control+z');
  await expect(source).toHaveValue('print 1;');
  await expect(page.locator('.stale-banner')).toBeVisible();
  await source.press('Control+Enter');
  await expect(page.locator('.stale-banner')).toHaveCount(0);
  await expect(page.locator('.problem')).toHaveCount(0);
  expect(errors).toEqual([]);
});

/** Fill the editor and compile with the keyboard shortcut. */
async function compileSource(page: Page, text: string) {
  const source = page.getByRole('textbox', { name: 'Source program' });
  await source.fill(text);
  await source.press('Control+Enter');
  return source;
}

async function selectionOf(source: Locator) {
  return source.evaluate((element) => ({
    start: (element as HTMLTextAreaElement).selectionStart,
    end: (element as HTMLTextAreaElement).selectionEnd,
  }));
}

test('shows the symbol table after successful semantic analysis', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await compileSource(page, 'let marks = 70;\nlet bonus = 5;\nprint marks + bonus;');
  const semanticTab = page.getByRole('tab', { name: /Semantic/ });
  await expect(semanticTab).toContainText('2 symbols');
  await semanticTab.click();
  await expect(page.getByRole('tabpanel')).toContainText('Semantic analysis passed');
  await expect(page.getByRole('tabpanel')).toContainText('has not been run');
  const rows = page.getByRole('table', { name: 'Symbol table' }).locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('td')).toHaveText(['1', 'marks', 'integer', '1', '5']);
  await expect(rows.nth(1).locator('td')).toHaveText(['2', 'bonus', 'integer', '2', '5']);

  // Picking a symbol highlights its declaration, not a later use of the same name.
  await page.getByRole('button', { name: 'marks: show declaration in the editor' }).click();
  const highlight = page.locator('.editor-layer mark.hl-token');
  await expect(highlight).toHaveText('marks');
  const offset = await highlight.evaluate((mark) => {
    const range = document.createRange();
    range.setStart(mark.parentNode!, 0);
    range.setEndBefore(mark);
    return range.toString().length;
  });
  expect(offset).toBe(4);
  expect(errors).toEqual([]);
});

test('jumps to a semantic error from the Problems panel', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const source = await compileSource(page, 'let score = 10;\nlet score = 20;');
  await expect(page.getByRole('tab', { name: /Semantic/ })).toHaveAttribute('aria-selected', 'true');
  const panel = page.getByRole('tabpanel');
  await expect(panel).toContainText('already declared at line 1, column 5');
  const partial = page.getByRole('table', { name: 'Partial symbol table' });
  await expect(partial.locator('tbody tr')).toHaveCount(1);
  await expect(partial.locator('tbody tr td')).toHaveText(['1', 'score', 'integer', '1', '5']);

  const problem = page.locator('.problem');
  await expect(problem).toHaveCount(1);
  await expect(problem).toContainText('Line 2, column 5');
  await expect(problem).toContainText('Semantic');
  await expect(page.locator('.gutter-line.has-error')).toHaveText(['2']);
  await problem.click();
  expect(await selectionOf(source)).toEqual({ start: 20, end: 25 });
  await expect(source).toBeFocused();
  expect(errors).toEqual([]);
});

test('recovers after a semantic error is corrected', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await compileSource(page, 'print missing;');
  await expect(page.locator('.problem')).toContainText("Undeclared variable 'missing'.");
  await expect(page.getByRole('tabpanel')).toContainText('No declarations were checked before the error.');

  await compileSource(page, 'let missing = 1;\nprint missing;');
  await expect(page.locator('.problem')).toHaveCount(0);
  await expect(page.locator('.problems')).toContainText('It has not been run.');
  await expect(page.locator('.editor-layer mark')).toHaveCount(0);
  const rows = page.getByRole('table', { name: 'Symbol table' }).locator('tbody tr');
  await expect(rows).toHaveCount(1);
  await expect(rows.locator('td')).toHaveText(['1', 'missing', 'integer', '1', '5']);
  expect(errors).toEqual([]);
});

test('marks semantic results stale after an edit until recompiled', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const source = await compileSource(page, 'let a = 1;\nprint a;');
  await page.getByRole('tab', { name: /Semantic/ }).click();
  await expect(page.getByRole('table', { name: 'Symbol table' }).locator('tbody tr')).toHaveCount(1);

  // Introduce an undeclared name but do not compile yet.
  await source.press('Control+End');
  await page.keyboard.type('\nprint b;');
  await expect(page.locator('.stale-banner')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Symbol table' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'a: show declaration in the editor' })).toBeDisabled();
  await expect(page.locator('.problem')).toHaveCount(0);

  await source.press('Control+Enter');
  await expect(page.locator('.stale-banner')).toHaveCount(0);
  await expect(page.getByRole('table', { name: 'Partial symbol table' }).locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('.problem')).toContainText('Line 3, column 7');
  await expect(page.locator('.problem')).toContainText("Undeclared variable 'b'.");
  expect(errors).toEqual([]);
});

/** The rendered text of every instruction row, in order. */
function instructionRows(page: Page) {
  return page.getByRole('table', { name: 'Three-address instructions' }).locator('tbody tr td:nth-child(2)');
}

test('displays generated three-address instructions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await compileSource(page, 'print 2 + 3 * 4;');
  const tab = page.getByRole('tab', { name: /Intermediate/ });
  await expect(tab).toContainText('3 instructions');
  await tab.click();
  await expect(instructionRows(page)).toHaveText(['%t1 = 3 * 4', '%t2 = 2 + %t1', 'PRINT %t2']);
  await expect(page.getByRole('tabpanel')).toContainText('have not been executed');

  // An arithmetic instruction links back to its operator in the source.
  await page.getByRole('button', { name: '%t2 = 2 + %t1: show source' }).click();
  const highlight = page.locator('.editor-layer mark.hl-token');
  await expect(highlight).toHaveText('+');
  const offset = await highlight.evaluate((mark) => {
    const range = document.createRange();
    range.setStart(mark.parentNode!, 0);
    range.setEndBefore(mark);
    return range.toString().length;
  });
  expect(offset).toBe(8);
  expect(errors).toEqual([]);
});

test('skips code generation after a semantic error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await compileSource(page, 'let a = 1;\nprint a + missing;');
  await expect(page.getByRole('tab', { name: /Semantic/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('table', { name: 'Partial symbol table' }).locator('tbody tr')).toHaveCount(1);
  const tab = page.getByRole('tab', { name: /Intermediate/ });
  await expect(tab).toContainText('Skipped');
  await tab.click();
  await expect(page.getByRole('tabpanel')).toContainText('Intermediate code was skipped');
  await expect(page.getByRole('tabpanel')).toContainText('no instructions were generated');
  await expect(page.getByRole('table', { name: 'Three-address instructions' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('keeps old instructions marked stale after an edit, including Undo', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const source = await compileSource(page, 'print 1 + 2;');
  await page.getByRole('tab', { name: /Intermediate/ }).click();
  await expect(instructionRows(page)).toHaveText(['%t1 = 1 + 2', 'PRINT %t1']);

  // One keystroke, so a single Undo restores the exact compiled text.
  await source.press('Control+End');
  await source.press('Space');
  await expect(source).toHaveValue('print 1 + 2; ');
  await expect(page.locator('.stale-banner')).toBeVisible();
  await expect(instructionRows(page)).toHaveText(['%t1 = 1 + 2', 'PRINT %t1']);
  await expect(page.getByRole('button', { name: '%t1 = 1 + 2: show source' })).toBeDisabled();

  await source.press('Control+z');
  await expect(source).toHaveValue('print 1 + 2;');
  await expect(page.locator('.stale-banner')).toBeVisible();
  await expect(page.getByRole('button', { name: '%t1 = 1 + 2: show source' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('shows fresh instructions with reset temporaries after recompiling', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await compileSource(page, 'print 1 + 2 + 3;');
  await page.getByRole('tab', { name: /Intermediate/ }).click();
  await expect(instructionRows(page)).toHaveText(['%t1 = 1 + 2', '%t2 = %t1 + 3', 'PRINT %t2']);

  await compileSource(page, 'let t1 = 7;\nprint t1 + 1;');
  await expect(page.locator('.stale-banner')).toHaveCount(0);
  await expect(instructionRows(page)).toHaveText(['t1 = 7', '%t1 = t1 + 1', 'PRINT %t1']);
  await expect(page.getByRole('tab', { name: /Intermediate/ })).toContainText('3 instructions');
  await expect(page.locator('.problems')).toContainText('It has not been run.');
  expect(errors).toEqual([]);
});
