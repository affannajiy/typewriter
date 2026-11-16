import { readFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

/**
 * One test per critical journey, against the production build served under
 * the GitHub Pages base path. Variations are covered by the unit tests.
 */

// Every test starts in a fresh browser context, so IndexedDB is empty.

async function createNotebook(page: Page, name: string) {
  await page.getByRole('main').getByRole('button', { name: 'New notebook' }).click();
  const dialog = page.getByRole('dialog', { name: 'New notebook' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create notebook' }).click();
}

/** The screen's own button, not the one in the sidebar or bottom bar. */
async function newPageInMain(page: Page) {
  await page.getByRole('main').getByRole('button', { name: 'New page' }).click();
}

/** Types into the page text. Each string is one paragraph. */
async function writeBody(page: Page, ...paragraphs: string[]) {
  await page.getByLabel('Page text').click();
  for (const [index, text] of paragraphs.entries()) {
    if (index > 0) await page.keyboard.press('Enter');
    await page.keyboard.type(text);
  }
}

/**
 * Chooses a radio button. The choice is stored before the button shows it,
 * so this waits for the stored state instead of the click.
 */
async function choose(page: Page, name: string) {
  const radio = page.getByRole('radio', { name });
  await radio.click({ force: true });
  await expect(radio).toBeChecked();
}

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('a workspace survives closing and reopening the app', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Your desk is clear' })).toBeVisible();

  await createNotebook(page, 'Organic Chemistry');
  await expect(page.getByRole('heading', { level: 1, name: 'Organic Chemistry' })).toBeVisible();

  await newPageInMain(page);
  await page.getByLabel('Page title').fill('Alkanes');
  await writeBody(page, 'Saturated hydrocarbons.', 'General formula CnH2n+2.');
  await expect(page.getByText('5 words')).toBeVisible();
  await expect(page.getByText(/Saved on this device at/)).toBeVisible();
  const pageUrl = page.url();

  // Reload at a deep link: direct navigation must work under the base path.
  await page.reload();
  await expect(page.getByLabel('Page title')).toHaveValue('Alkanes');
  await expect(page.getByLabel('Page text').locator('p')).toHaveText(['Saturated hydrocarbons.', 'General formula CnH2n+2.']);

  // A second tab on the same origin sees the same data.
  const second = await page.context().newPage();
  await second.goto(pageUrl);
  await expect(second.getByLabel('Page title')).toHaveValue('Alkanes');
  await second.close();

  await page.goto('./#/library');
  await expect(page.getByRole('link', { name: 'Organic Chemistry' })).toBeVisible();
});

test('deleting is reversible, and permanent deletion asks first', async ({ page }) => {
  await page.goto('./');
  await createNotebook(page, 'History');
  await newPageInMain(page);
  await page.getByLabel('Page title').fill('The Printing Press');
  await expect(page.getByText(/Saved on this device at/)).toBeVisible();

  await page.goto('./#/library');
  await page.getByRole('button', { name: 'Actions for History' }).click();
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
  await expect(page.getByText('“History” and 1 item inside it moved to the Trash.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your library is empty' })).toBeVisible();

  await page.goto('./#/trash');
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('heading', { name: 'The Trash is empty' })).toBeVisible();

  await page.goto('./#/library');
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByRole('link', { name: /The Printing Press/ })).toBeVisible();

  // Permanent deletion: the safe button has focus, and cancelling keeps the item.
  await page.getByRole('button', { name: 'Actions for History' }).click();
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click();
  // Wait for the move to finish: the first message may still be on screen, so expect two.
  await expect(page.getByText('“History” and 1 item inside it moved to the Trash.')).toHaveCount(2);
  await page.goto('./#/trash');
  await page.getByRole('button', { name: 'Delete History permanently' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete “History” permanently?' });
  await expect(confirm.getByText('2 items will be deleted from this device.')).toBeVisible();
  await expect(confirm.getByRole('button', { name: 'Keep in Trash' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Keep in Trash' }).click();
  await expect(page.getByText('History', { exact: true })).toBeVisible();
});

test('a backup restores a workspace on a clean browser', async ({ page, browser }) => {
  await page.goto('./');
  await createNotebook(page, 'Field Notes');
  await newPageInMain(page);
  await page.getByLabel('Page title').fill('Tide pools');
  await writeBody(page, 'Anemones close at low tide.');
  await expect(page.getByText(/Saved on this device at/)).toBeVisible();

  await page.goto('./#/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^typenote-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const backupPath = await file.path();
  expect(JSON.parse(readFileSync(backupPath, 'utf8'))).toMatchObject({ app: 'typenote', formatVersion: 1 });

  // A new context is a different, empty browser profile.
  const clean = await browser.newContext();
  const fresh = await clean.newPage();
  await fresh.goto(page.url());
  await fresh.getByTestId('restore-file').setInputFiles(backupPath);
  const dialog = fresh.getByRole('dialog', { name: 'Restore backup' });
  await expect(dialog.getByText('This backup holds 0 folders, 1 notebook, 1 page and 0 tags.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(fresh.getByText('Restore complete: 2 added, 0 updated, 0 left unchanged.')).toBeVisible();

  await fresh.goto(page.url().replace('#/settings', '#/library'));
  await fresh.getByRole('link', { name: 'Field Notes' }).click();
  await fresh.getByRole('link', { name: /Tide pools/ }).click();
  await expect(fresh.getByLabel('Page text')).toHaveText('Anemones close at low tide.');

  // A file that is not a backup is refused with an explanation, and nothing changes.
  await fresh.goto(page.url());
  await fresh.getByTestId('restore-file').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":"world"}') });
  await expect(fresh.getByText('This file is not a TypeNote backup. Choose a file that TypeNote exported.')).toBeVisible();
  await clean.close();
});

test('the theme applies everywhere and persists', async ({ page }) => {
  await page.goto('./#/settings');
  // The radio reflects the stored setting, so it becomes checked once the database write lands.
  await page.getByRole('radio', { name: 'Midnight' }).click();
  await expect(page.getByRole('radio', { name: 'Midnight' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight');
  const background = () => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  await expect.poll(background).toBe('rgb(30, 37, 48)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight');
  await page.goto('./#/library');
  await expect.poll(background).toBe('rgb(30, 37, 48)');
});

test('the layout fits the screen with no horizontal scroll', async ({ page }) => {
  await page.goto('./');
  await createNotebook(page, 'A notebook with a deliberately long name to test wrapping on narrow screens');
  // A page with the editor and its toolbar, and a word too long to fit on a line.
  await newPageInMain(page);
  await writeBody(page, 'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(4));
  await expect(page.getByText(/Saved on this device at/)).toBeVisible();
  const pageRoute = `./${new URL(page.url()).hash}`;
  const screens: [string, () => Promise<void>][] = [
    ['./', () => page.getByRole('heading', { name: 'Continue working' }).waitFor()],
    ['./#/library', () => page.getByRole('heading', { level: 1, name: 'Library' }).waitFor()],
    ['./#/tags', () => page.getByRole('heading', { level: 1, name: 'Tags' }).waitFor()],
    ['./#/trash', () => page.getByRole('heading', { level: 1, name: 'Trash' }).waitFor()],
    ['./#/settings', () => page.getByRole('heading', { level: 1, name: 'Settings' }).waitFor()],
    [pageRoute, () => page.getByRole('toolbar', { name: 'Formatting' }).waitFor()],
  ];
  for (const [route, shown] of screens) {
    await page.goto(route);
    // Wait for this screen: a hash change does not reload the document.
    await shown();
    expect(await noSidewaysScroll(page), `horizontal overflow on ${route}`).toBeLessThanOrEqual(0);
  }
});

/** What the app has asked the browser to play, read from inside the page. */
interface Heard {
  strikes: number;
  bells: number;
  slides: number;
}

test('typewriter sounds play only when turned on, and the choice persists', async ({ page }) => {
  // Record the noise bursts and tones the app asks the browser to play.
  await page.addInitScript(() => {
    const w = window as unknown as { noise: AudioBufferSourceNode[]; tones: OscillatorNode[]; heard: () => Heard };
    w.noise = [];
    w.tones = [];
    const createBufferSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (...args) {
      const node = createBufferSource.apply(this, args);
      w.noise.push(node);
      return node;
    };
    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (...args) {
      const node = createOscillator.apply(this, args);
      w.tones.push(node);
      return node;
    };
    w.heard = () => ({
      strikes: w.noise.length,
      // One bell is two close tones near 2250 Hz. Sliding sounds are the only noise that loops.
      bells: w.tones.filter((tone) => tone.frequency.value > 2200 && tone.frequency.value < 2300).length / 2,
      slides: w.noise.filter((source) => source.loop).length,
    });
  });
  const heard = () => page.evaluate(() => (window as unknown as { heard: () => Heard }).heard());
  const strikes = async () => (await heard()).strikes;

  await page.goto('./');
  await newPageInMain(page);
  const body = page.getByLabel('Page text');
  const toggle = page.getByRole('button', { name: 'Typewriter sounds' });

  // Off by default: typing is silent.
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await body.pressSequentially('Quiet');
  expect(await strikes()).toBe(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const afterToggle = await strikes();
  await body.pressSequentially(' loud', { delay: 40 });
  await body.press('Enter');
  await expect.poll(strikes).toBeGreaterThan(afterToggle);
  await expect(body.locator('p')).toHaveText(['Quiet loud', '']);

  // Pressing Enter on a short line rings the bell and returns the carriage.
  // (The first slide was the sheet of paper fed in when sounds were turned on.)
  await expect.poll(heard).toMatchObject({ bells: 1, slides: 2 });

  // Half a line: keys only. No bell, no carriage return.
  await body.pressSequentially('sphinx of black', { delay: 5 });
  expect(await heard()).toMatchObject({ bells: 1, slides: 2 });

  // Typing past the end of the line: each wrap returns the carriage and rings once.
  await body.pressSequentially(' quartz judge my vow'.repeat(8), { delay: 5 });
  await expect.poll(async () => (await heard()).slides).toBeGreaterThanOrEqual(3);
  const after = await heard();
  expect(after.bells).toBe(after.slides - 1);
  await expect(page.getByText(/Saved on this device at/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Typewriter sounds' })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('./#/settings');
  await expect(page.getByRole('radio', { name: 'On', exact: true }).and(page.locator('[name="typing-sound"]'))).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Every new line' })).toBeChecked();
});

test('rich text is written with the keyboard, the slash menu and the toolbar, and survives a reload', async ({ page }) => {
  await page.goto('./');
  await newPageInMain(page);
  const body = page.getByLabel('Page text');
  await body.click();

  // Slash menu: filter, move with the arrow keys, choose with Enter.
  await page.keyboard.type('/head');
  const menu = page.getByRole('listbox', { name: 'Block types' });
  await expect(menu.getByRole('option')).toHaveText(['Heading 1', 'Heading 2', 'Heading 3']);
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('option', { name: 'Heading 2' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  await page.keyboard.type('Alkanes');
  await expect(body.locator('h2')).toHaveText('Alkanes');

  // A shortcut for bold, in the middle of a sentence.
  await page.keyboard.press('Enter');
  await page.keyboard.type('Plain and ');
  await page.keyboard.press('ControlOrMeta+b');
  await expect(page.getByRole('button', { name: /^Bold/ })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.type('bold');
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type(' text.');
  await expect(body.locator('strong')).toHaveText('bold');

  // Typing "- " starts a bulleted list; Enter on an empty item ends it.
  await page.keyboard.press('Enter');
  await page.keyboard.type('- first point');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second point');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(body.locator('ul > li')).toHaveText(['first point', 'second point']);

  // Toolbar: a checklist with a real checkbox.
  await page.getByRole('button', { name: /^Checklist/ }).click();
  await page.keyboard.type('buy a flask');
  const checkbox = body.getByRole('checkbox');
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(checkbox).toBeChecked();

  // "/" inside code is just a character.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /^Code block/ }).click();
  await page.keyboard.type('/usr/bin');
  await expect(menu).toBeHidden();
  await expect(body.locator('pre')).toHaveText('/usr/bin');

  await expect(page.getByText(/Saved on this device at/)).toBeVisible();
  const blockIds = () => body.locator('[data-id]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-id')));
  const before = await blockIds();
  expect(new Set(before).size).toBe(before.length);

  await page.reload();
  await expect(body.locator('h2')).toHaveText('Alkanes');
  await expect(body.locator('strong')).toHaveText('bold');
  await expect(body.locator('ul:not([data-type]) > li')).toHaveText(['first point', 'second point']);
  await expect(body.getByRole('checkbox')).toBeChecked();
  await expect(body.locator('pre')).toHaveText('/usr/bin');
  // Block IDs are the same after a reload: they are stored, not made up on opening.
  expect(await blockIds()).toEqual(before);

  // Move a block with the keyboard, then take it back with undo.
  await body.locator('h2').click();
  await page.keyboard.press('Alt+Shift+ArrowDown');
  await expect(body.locator(':scope > *').nth(1)).toHaveText('Alkanes');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(body.locator(':scope > *').first()).toHaveText('Alkanes');
  // The block kept its ID through the move and the undo.
  expect((await blockIds())[0]).toBe(before[0]);
});

test('search finds a page by its text from any screen, and the palette runs commands', async ({ page }) => {
  await page.goto('./');
  await createNotebook(page, 'History');
  await newPageInMain(page);
  await page.getByLabel('Page title').fill('The Printing Press');
  await writeBody(page, 'Gutenberg, around 1440.');
  await expect(page.getByText(/Saved on this device at/)).toBeVisible();

  await page.goto('./#/settings');
  await page.getByRole('heading', { level: 1, name: 'Settings' }).waitFor();
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Search and commands' });
  const field = palette.getByRole('combobox');
  await expect(field).toBeFocused();
  await field.fill('gutenberg');
  const hit = palette.getByRole('option', { name: /The Printing Press/ });
  await expect(hit).toContainText('Gutenberg, around 1440.');
  await expect(hit).toContainText('Page in History');
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();
  await expect(page.getByLabel('Page title')).toHaveValue('The Printing Press');

  // The visible way in: the Search button. Escape closes and changes nothing.
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await field.fill('zzzz');
  await expect(palette.getByText(/Nothing matches/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
  await expect(page.getByLabel('Page title')).toHaveValue('The Printing Press');

  // On a page, the palette also formats: the caret's block becomes a heading.
  await page.getByLabel('Page text').click();
  await page.keyboard.press('ControlOrMeta+k');
  await field.fill('heading 1');
  await expect(palette.getByRole('option', { name: /Heading 1/ })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Page text').locator('h1')).toHaveText('Gutenberg, around 1440.');
  // Typing continues in the text: focus came back to the editor.
  await page.keyboard.type('!');
  await expect(page.getByLabel('Page text').locator('h1')).toContainText('!');
});

test('the sheets layout breaks the text into pages, and the paper settings apply', async ({ page }) => {
  // Several hundred key presses and two reloads: allow three times the usual limit.
  test.slow();
  await page.goto('./');
  await newPageInMain(page);
  const body = page.getByLabel('Page text');
  await body.click();
  for (let line = 1; line <= 40; line++) {
    await page.keyboard.type(`Line ${line}`);
    await page.keyboard.press('Enter');
  }
  // Short enough to fit on one sheet of any size. A block taller than a sheet is not split: see pagination.ts.
  await page.keyboard.type('A closing paragraph that wraps over a few lines on a narrow sheet, so that the last page ends with a taller block.');

  const sheets = page.getByTestId('sheet');
  await expect(sheets).toHaveCount(0);
  await choose(page, 'Sheets of paper');
  await expect(sheets).not.toHaveCount(0);
  await expect(sheets).not.toHaveCount(1);

  // Every block lies wholly on one sheet: none is cut by a page edge.
  const cut = () =>
    page.evaluate(() => {
      const pages = Array.from(document.querySelectorAll('[data-testid="sheet"]'), (sheet) => sheet.getBoundingClientRect());
      const blocks = Array.from(document.querySelectorAll('.tn-prose > :not(.tn-page-spacer)'), (block) => block.getBoundingClientRect());
      return blocks.filter((block) => !pages.some((sheet) => block.top >= sheet.top - 1 && block.bottom <= sheet.bottom + 1)).length;
    });
  await expect.poll(cut).toBe(0);
  const count = await sheets.count();
  await expect(page.getByText(`${count} sheets`)).toBeVisible();
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);

  // Typing at the top pushes the text down: the breaks follow.
  await body.locator('p').first().click();
  for (let line = 0; line < 6; line++) await page.keyboard.press('Enter');
  await expect.poll(cut).toBe(0);

  // Spacers are drawing aids. They are not saved as content.
  await expect(page.getByText(/Saved on this device at/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Sheets of paper' })).toBeChecked();
  await expect(sheets).not.toHaveCount(0);
  await expect.poll(cut).toBe(0);
  await expect(body.locator('p').filter({ hasText: /^Line 40$/ })).toHaveCount(1);

  // The paper settings apply: the sheet takes the shape of the paper, and the margins grow.
  const shape = () =>
    sheets.first().evaluate((sheet) => {
      const paper = sheet.getBoundingClientRect();
      const text = document.querySelector('.tn-prose')!.getBoundingClientRect();
      return { ratio: paper.height / paper.width, margin: (text.left - paper.left) / paper.width };
    });
  const a4 = await shape();
  expect(a4.ratio).toBeCloseTo(1123 / 794, 1);
  expect(a4.margin).toBeCloseTo(96 / 794, 2);
  const pageUrl = page.url();
  await page.goto('./#/settings');
  await choose(page, 'Letter');
  await choose(page, 'Wide');
  await page.goto(pageUrl);
  await expect.poll(async () => (await shape()).ratio).toBeCloseTo(1056 / 816, 1);
  await expect.poll(async () => (await shape()).margin).toBeCloseTo(144 / 816, 2);
  await expect.poll(cut).toBe(0);
  expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0);
});
