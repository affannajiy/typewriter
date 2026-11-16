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

test('a workspace survives closing and reopening the app', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Your desk is clear' })).toBeVisible();

  await createNotebook(page, 'Organic Chemistry');
  await expect(page.getByRole('heading', { level: 1, name: 'Organic Chemistry' })).toBeVisible();

  await newPageInMain(page);
  await page.getByLabel('Page title').fill('Alkanes');
  await page.getByLabel('Page text').fill('Saturated hydrocarbons.\nGeneral formula CnH2n+2.');
  await expect(page.getByText(/Saved on this device at/)).toBeVisible();
  await expect(page.getByText('5 words')).toBeVisible();
  const pageUrl = page.url();

  // Reload at a deep link: direct navigation must work under the base path.
  await page.reload();
  await expect(page.getByLabel('Page title')).toHaveValue('Alkanes');
  await expect(page.getByLabel('Page text')).toHaveValue('Saturated hydrocarbons.\nGeneral formula CnH2n+2.');

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
  await page.getByLabel('Page text').fill('Anemones close at low tide.');
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
  await expect(fresh.getByLabel('Page text')).toHaveValue('Anemones close at low tide.');

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
  for (const route of ['./', './#/library', './#/tags', './#/trash', './#/settings']) {
    await page.goto(route);
    await page.getByRole('main').waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(0);
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
  await expect(body).toHaveValue('Quiet loud\n');

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
