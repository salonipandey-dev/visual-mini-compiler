import { expect, test, type Download, type Page } from '@playwright/test';

const MARKS = 'let marks = 70;\nlet bonus = 5;\nprint marks + bonus;\n';

/**
 * File contents for Playwright's file chooser. Node's Buffer exists at runtime;
 * the cast keeps this file type-correct whether or not Node's types are installed.
 */
const NodeBuffer = (globalThis as unknown as {
  Buffer: { from(data: string | number[], encoding?: 'utf8'): never };
}).Buffer;

const editor = (page: Page) => page.getByRole('textbox', { name: 'Source program' });
const runButton = (page: Page) => page.getByRole('button', { name: 'Run', exact: true });
const saveStatus = (page: Page) => page.getByTestId('save-status');
const fileName = (page: Page) => page.locator('.file-name');
const programOutput = (page: Page) => page.getByLabel('Program output', { exact: true });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Replace the edited source?' });

/** Choose a file through the real Open .mcl button and browser file chooser. */
async function openFile(page: Page, name: string, contents: string | number[]) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open .mcl' }).click();
  const bytes = typeof contents === 'string' ? NodeBuffer.from(contents, 'utf8') : NodeBuffer.from(contents);
  await (await chooser).setFiles({ name, mimeType: 'text/plain', buffer: bytes });
}

/** Read a finished download's bytes as UTF-8 text. */
async function downloadedText(download: Download): Promise<string> {
  const stream = (await download.createReadStream()) as unknown as AsyncIterable<Uint8Array> | null;
  if (!stream) throw new Error('Download has no contents.');
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

async function startDownload(page: Page, button: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: button }).click();
  const download = await pending;
  return { name: download.suggestedFilename(), text: await downloadedText(download) };
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test('complete workflow: open, compile, run, edit, decide, download, run again', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');

  // 1. Import a .mcl file (Windows line endings are normalized).
  await openFile(page, 'marks.mcl', MARKS.replace(/\n/g, '\r\n'));
  await expect(fileName(page)).toHaveText('marks.mcl');
  await expect(saveStatus(page)).toHaveText('No unsaved changes');
  await expect(editor(page)).toHaveValue(MARKS);
  await expect(runButton(page)).toBeDisabled(); // opening never compiles or runs

  // 2. Compile and inspect the stage results.
  await editor(page).press('Control+Enter');
  await expect(page.getByRole('tab', { name: /Lexical/ })).toContainText('16 tokens');
  await expect(page.getByRole('tab', { name: /Semantic/ })).toContainText('2 symbols');
  await expect(page.getByRole('tab', { name: /Intermediate/ })).toContainText('4 instructions');
  await page.getByRole('tab', { name: /Semantic/ }).click();
  await expect(page.getByRole('table', { name: 'Symbol table' }).locator('tbody tr')).toHaveCount(2);

  // 3. Run and observe the expected output.
  await runButton(page).click();
  await expect(programOutput(page)).toHaveText('75');

  // 4. Edit the source: unsaved, and Run becomes unavailable.
  await editor(page).press('Control+End');
  await page.keyboard.type('print marks;');
  await expect(saveStatus(page)).toHaveText('Unsaved changes');
  await expect(runButton(page)).toBeDisabled();
  await expect(programOutput(page)).toHaveCount(0);

  // 5. The unsaved replacement decision: Load Example asks first.
  await page.locator('.example-picker select').selectOption('precedence');
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText('changes that are not in marks.mcl');
  await expect(dialog(page)).toContainText('Loading the example "Precedence and parentheses"');

  // 6. Download the edited source from the dialog and verify its contents.
  const copy = await startDownload(page, 'Download a copy');
  expect(copy).toEqual({ name: 'marks.mcl', text: MARKS + 'print marks;' });
  await expect(dialog(page)).toContainText('Download of marks.mcl started. Check that the file was saved');
  await expect(dialog(page).getByRole('button', { name: 'Replace source' })).toBeVisible();
  await expect(editor(page)).toHaveValue(MARKS + 'print marks;'); // nothing replaced yet
  await dialog(page).getByRole('button', { name: 'Keep editing' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(editor(page)).toHaveValue(MARKS + 'print marks;');
  await expect(saveStatus(page)).toHaveText('Unsaved: download started, not confirmed');

  // 7. Compile and run again successfully.
  await editor(page).press('Control+Enter');
  await runButton(page).click();
  await expect(programOutput(page)).toHaveText('75\n70');
  expect(errors).toEqual([]);
});

test('replacing without downloading loads the example and clears old results', async ({ page }) => {
  await page.goto('/');
  await editor(page).fill('print 1;');
  await editor(page).press('Control+Enter');
  await runButton(page).click();
  await expect(programOutput(page)).toHaveText('1');

  await page.locator('.example-picker select').selectOption('precedence');
  await dialog(page).getByRole('button', { name: 'Replace without downloading' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(fileName(page)).toHaveText('Untitled (example: Precedence and parentheses)');
  await expect(saveStatus(page)).toHaveText('No unsaved changes');
  await expect(runButton(page)).toBeDisabled();
  await expect(programOutput(page)).toHaveCount(0);
  await expect(page.locator('.output')).toContainText('Compile the program, then press Run');
});

test('Escape in the replacement dialog keeps editing', async ({ page }) => {
  await page.goto('/');
  await editor(page).fill('print 2;');
  await page.locator('.example-picker select').selectOption('unary');
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(editor(page)).toHaveValue('print 2;');
  await expect(saveStatus(page)).toHaveText('Unsaved changes');
});

test('opening a file over edited source asks first, and Keep editing changes nothing', async ({ page }) => {
  await page.goto('/');
  await editor(page).fill('print 3;');
  await openFile(page, 'other.mcl', 'print 4;\n');
  await expect(dialog(page)).toContainText('Opening other.mcl');
  await dialog(page).getByRole('button', { name: 'Keep editing' }).click();
  await expect(editor(page)).toHaveValue('print 3;');
  await expect(fileName(page)).toHaveText('Untitled (example: Marks and bonus)');
});

test('canceling file selection keeps the editor, compilation, and output', async ({ page }) => {
  await page.goto('/');
  await editor(page).press('Control+Enter');
  await runButton(page).click();
  await expect(programOutput(page)).toHaveText('75');
  const before = await editor(page).inputValue();

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open .mcl' }).click();
  await (await chooser).setFiles([]); // the user closed the dialog without choosing
  await expect(editor(page)).toHaveValue(before);
  await expect(runButton(page)).toBeEnabled();
  await expect(programOutput(page)).toHaveText('75');
  await expect(page.locator('.file-notice')).toHaveCount(0);
});

test('a file that is not UTF-8 is rejected and current work is preserved', async ({ page }) => {
  await page.goto('/');
  await editor(page).press('Control+Enter');
  await runButton(page).click();
  const before = await editor(page).inputValue();

  await openFile(page, 'latin1.mcl', [0x70, 0x72, 0x69, 0x6e, 0x74, 0x20, 0xe9, 0x3b]);
  await expect(page.getByRole('alert')).toHaveText('Could not open latin1.mcl: it is not valid UTF-8 text. The editor was not changed.');
  await expect(editor(page)).toHaveValue(before);
  await expect(fileName(page)).toHaveText('Untitled (example: Marks and bonus)');
  await expect(runButton(page)).toBeEnabled();
  await expect(programOutput(page)).toHaveText('75');
});

test('a file with language errors loads, and Compile reports them', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'broken.mcl', 'let total = 1;\nprint total @ 2;\n');
  await expect(editor(page)).toHaveValue('let total = 1;\nprint total @ 2;\n');
  await editor(page).press('Control+Enter');
  await expect(page.locator('.problem')).toContainText('Line 2, column 13');
  await expect(runButton(page)).toBeDisabled();
});

test('a file over the 5,000-character limit loads in full and Compile reports the limit', async ({ page }) => {
  await page.goto('/');
  const long = '#'.repeat(6000);
  await openFile(page, 'long.mcl', long);
  await expect(editor(page)).toHaveValue(long);
  await editor(page).press('Control+Enter');
  await expect(page.locator('.problem')).toContainText('Source exceeds the 5000-character limit.');
});

test('reopening the same file replaces it and requires recompiling', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'marks.mcl', MARKS);
  await editor(page).press('Control+Enter');
  await runButton(page).click();
  await expect(programOutput(page)).toHaveText('75');

  await openFile(page, 'marks.mcl', MARKS); // identical text, same name
  await expect(editor(page)).toHaveValue(MARKS);
  await expect(saveStatus(page)).toHaveText('No unsaved changes');
  await expect(runButton(page)).toBeDisabled();
  await expect(programOutput(page)).toHaveCount(0);
  await editor(page).press('Control+Enter');
  await expect(runButton(page)).toBeEnabled();
});

test('downloading unchanged source keeps the compilation valid', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'notes.txt', MARKS);
  await editor(page).press('Control+Enter');
  await expect(runButton(page)).toBeEnabled();

  const saved = await startDownload(page, 'Download .mcl');
  expect(saved).toEqual({ name: 'notes.mcl', text: MARKS });
  await expect(page.locator('.file-notice')).toContainText('this page cannot confirm that the file was written');
  await expect(runButton(page)).toBeEnabled();
  await expect(page.locator('.stale-banner')).toHaveCount(0);
  await expect(saveStatus(page)).toHaveText('No unsaved changes');
  await runButton(page).click();
  await expect(programOutput(page)).toHaveText('75');
});

test('Undo clears the unsaved difference but the compilation stays stale', async ({ page }) => {
  await page.goto('/');
  await openFile(page, 'marks.mcl', MARKS);
  await editor(page).press('Control+Enter');
  await editor(page).press('Control+End');
  await editor(page).press('Space');
  await expect(saveStatus(page)).toHaveText('Unsaved changes');
  await editor(page).press('Control+z');
  await expect(editor(page)).toHaveValue(MARKS);
  await expect(saveStatus(page)).toHaveText('No unsaved changes');
  await expect(runButton(page)).toBeDisabled();
  await expect(page.locator('.stale-banner')).toBeVisible();
});

/** Make reads of files whose names start with "slow" take 700 ms. */
async function makeSlowReads(page: Page) {
  await page.evaluate(() => {
    const original = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function (this: Blob) {
      const slow = this instanceof File && this.name.startsWith('slow');
      return new Promise<void>((resolve) => setTimeout(resolve, slow ? 700 : 0)).then(() => original.call(this));
    };
  });
}

test('a slow older read cannot overwrite a newer file selection or newer edits', async ({ page }) => {
  await page.goto('/');
  await makeSlowReads(page);

  // Newer selection wins.
  await openFile(page, 'slow.mcl', 'print 1;\n');
  await openFile(page, 'fast.mcl', 'print 2;\n');
  await expect(fileName(page)).toHaveText('fast.mcl');
  await page.waitForTimeout(1000); // the slow read has now finished
  await expect(editor(page)).toHaveValue('print 2;\n');
  await expect(fileName(page)).toHaveText('fast.mcl');
  await expect(dialog(page)).toHaveCount(0);

  // Edits made while a read is in progress are not silently overwritten.
  await openFile(page, 'slow2.mcl', 'print 3;\n');
  await editor(page).press('Control+End');
  await page.keyboard.type('print 9;');
  await expect(dialog(page)).toBeVisible({ timeout: 3000 });
  await expect(dialog(page)).toContainText('Opening slow2.mcl');
  await dialog(page).getByRole('button', { name: 'Keep editing' }).click();
  await expect(editor(page)).toHaveValue('print 2;\nprint 9;');
});

test('warns before leaving with unsaved changes, and not when clean', async ({ page, context }) => {
  await page.goto('/');
  await editor(page).press('Control+End');
  await editor(page).press('Space');
  const warning = page.waitForEvent('dialog');
  await page.close({ runBeforeUnload: true });
  const shown = await warning;
  expect(shown.type()).toBe('beforeunload');
  await shown.accept();

  const clean = await context.newPage();
  const dialogs: string[] = [];
  clean.on('dialog', (d) => {
    dialogs.push(d.type());
    void d.accept();
  });
  await clean.goto('/');
  await editor(clean).press('Control+End'); // a user gesture, but no change
  const closed = clean.waitForEvent('close');
  await clean.close({ runBeforeUnload: true });
  await closed;
  expect(dialogs).toEqual([]);
});

test('choosing an example while an older file read is in progress keeps the example decision', async ({ page }) => {
  await page.goto('/');
  await makeSlowReads(page);
  await editor(page).press('Control+End');
  await page.keyboard.type('print 9;'); // unsaved edits, so the example will ask first
  await openFile(page, 'slow.mcl', 'print 1;\n'); // still being read
  await page.locator('.example-picker select').selectOption('precedence'); // the newer request
  await expect(dialog(page)).toContainText('Loading the example "Precedence and parentheses"');

  await page.waitForTimeout(1000); // the older read has now finished
  await expect(dialog(page)).toContainText('Loading the example "Precedence and parentheses"');
  await expect(dialog(page)).not.toContainText('slow.mcl');
  await dialog(page).getByRole('button', { name: 'Replace without downloading' }).click();
  await expect(fileName(page)).toHaveText('Untitled (example: Precedence and parentheses)');
  await expect(editor(page)).not.toHaveValue('print 1;\n');
  await page.waitForTimeout(300);
  await expect(dialog(page)).toHaveCount(0);
});
