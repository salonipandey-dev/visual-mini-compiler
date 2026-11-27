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
  await expect(page.getByRole('tabpanel')).toContainText('does not run the program');
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
  await expect(page.locator('.problems')).toContainText('Compiling does not run it');
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
  await expect(page.getByRole('tabpanel')).toContainText('Generating them does not execute');

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
  await expect(page.locator('.problems')).toContainText('Compiling does not run it');
  expect(errors).toEqual([]);
});

const MARKS = 'let marks = 70;\nlet bonus = 5;\nprint marks + bonus;';
const runButton = (page: Page) => page.getByRole('button', { name: 'Run', exact: true });
const programOutput = (page: Page) => page.getByLabel('Program output', { exact: true });

test('compiles without running, then Run prints 75', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(runButton(page)).toBeDisabled();
  await compileSource(page, MARKS);
  // Compiling alone produces no output.
  await expect(page.locator('.output')).toContainText('Compilation 1 is ready. Press Run to execute its 4 instructions.');
  await expect(programOutput(page)).toHaveCount(0);
  await expect(runButton(page)).toBeEnabled();
  await runButton(page).click();
  await expect(page.locator('.output')).toContainText('Ran successfully');
  await expect(page.locator('.output')).toContainText('Run 1 of compilation 1 finished successfully and printed 1 line.');
  await expect(programOutput(page)).toHaveText('75');
  expect(errors).toEqual([]);
});

test('running twice replaces the output instead of adding to it', async ({ page }) => {
  await page.goto('/');
  await compileSource(page, MARKS + '\nprint marks;');
  await runButton(page).click();
  await expect(programOutput(page)).toHaveText('75\n70');
  await runButton(page).click();
  await expect(page.locator('.output')).toContainText('Run 2 of compilation 1');
  await expect(programOutput(page)).toHaveText('75\n70');
  // The keyboard shortcut runs too, still with fresh state.
  await page.getByRole('textbox', { name: 'Source program' }).press('Control+Shift+Enter');
  await expect(page.locator('.output')).toContainText('Run 3 of compilation 1');
  await expect(programOutput(page)).toHaveText('75\n70');
});

test('an edit after compiling makes Run unavailable and clears the output', async ({ page }) => {
  await page.goto('/');
  const source = await compileSource(page, MARKS);
  await runButton(page).click();
  await expect(programOutput(page)).toHaveText('75');

  await source.press('Control+End');
  await source.press('Space');
  await expect(runButton(page)).toBeDisabled();
  await expect(programOutput(page)).toHaveCount(0);
  await expect(page.locator('.output')).toContainText('the source changed after compilation 1');
  // The shortcut is guarded by the Run handler itself, not only the disabled button.
  await source.press('Control+Shift+Enter');
  await expect(page.locator('[aria-live]')).toHaveText('Run is unavailable: compile the current source first.');
  await expect(programOutput(page)).toHaveCount(0);
  await expect(page.locator('.output')).not.toContainText('Ran successfully');
});

test('an edit followed by Undo still requires recompiling before Run', async ({ page }) => {
  await page.goto('/');
  const source = await compileSource(page, MARKS);
  await runButton(page).click();
  await expect(programOutput(page)).toHaveText('75');

  await source.press('Control+End');
  await source.press('Space');
  await source.press('Control+z');
  await expect(source).toHaveValue(MARKS);
  await expect(runButton(page)).toBeDisabled();
  await expect(page.locator('.stale-banner')).toBeVisible();
  await source.press('Control+Shift+Enter');
  await expect(page.locator('[aria-live]')).toHaveText('Run is unavailable: compile the current source first.');
  await expect(programOutput(page)).toHaveCount(0);

  await source.press('Control+Enter');
  await expect(runButton(page)).toBeEnabled();
  await runButton(page).click();
  await expect(page.locator('.output')).toContainText('Run 1 of compilation 2');
  await expect(programOutput(page)).toHaveText('75');
});

test('a failed compilation keeps Run unavailable', async ({ page }) => {
  await page.goto('/');
  const source = await compileSource(page, 'print missing;');
  await expect(page.locator('.problem')).toHaveCount(1);
  await expect(runButton(page)).toBeDisabled();
  await expect(page.locator('.output')).toContainText('Run is unavailable because compilation 1 failed');
  await source.press('Control+Shift+Enter');
  await expect(page.locator('[aria-live]')).toHaveText('Run is unavailable because compilation failed.');
  await expect(programOutput(page)).toHaveCount(0);
  await expect(page.locator('.output')).toContainText('Run is unavailable because compilation 1 failed');
});

test('a runtime failure shows its diagnostic, location, and partial output', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const nines = '9'.repeat(100);
  const source = await compileSource(page, `print 1;\nprint ${nines} * 2;\nprint 3;`);
  await expect(page.locator('.problem')).toHaveCount(0); // compilation succeeded
  await runButton(page).click();
  const output = page.locator('.output');
  await expect(output).toContainText('Runtime error');
  await expect(output).toContainText('stopped with a runtime error at line 2, column 108');
  await expect(output).toContainText('Compilation itself succeeded.');
  await expect(output).toContainText("Integer limit exceeded: '*' produced a 101-digit value.");
  await expect(output).toContainText('Partial output (printed before the error)');
  await expect(page.getByLabel('Partial program output')).toHaveText('1');
  await expect(page.locator('.problem')).toHaveCount(0); // runtime errors are not compile problems
  await expect(page.getByRole('tab', { name: /Intermediate/ })).toContainText('instructions');

  await page.getByRole('button', { name: 'Show in source' }).click();
  expect(await selectionOf(source)).toEqual({ start: 116, end: 117 });
  await expect(page.locator('.gutter-line.has-error')).toHaveText(['2']);
  expect(errors).toEqual([]);
});

test('correcting a program after a runtime error allows a successful run', async ({ page }) => {
  await page.goto('/');
  const nines = '9'.repeat(100);
  await compileSource(page, `print 1;\nprint ${nines} + 1;`);
  await runButton(page).click();
  await expect(page.locator('.output')).toContainText('Runtime error');

  await compileSource(page, `print 1;\nprint ${nines} - 1;`);
  await expect(page.locator('.output')).not.toContainText('Runtime error');
  await expect(page.locator('.output')).toContainText('ready');
  await runButton(page).click();
  await expect(page.locator('.output')).toContainText('Ran successfully');
  await expect(programOutput(page)).toHaveText('1\n' + '9'.repeat(99) + '8');
  await expect(page.locator('.gutter-line.has-error')).toHaveCount(0);
});
