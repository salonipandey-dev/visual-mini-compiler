import { expect, test } from '@playwright/test';

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
  await expect(page.getByRole('tabpanel')).toContainText('Semantic analysis is not built yet');
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
