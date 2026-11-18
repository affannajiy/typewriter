import { expect, test } from '@playwright/test';
import { makePdf } from './pdfFixture';

/**
 * Milestone 8: the app opens and works with no network once it has been
 * visited. The service worker must serve every file, the lazy screens, the
 * fonts and PDF.js's worker and data files included.
 */

// The one journey that needs the service worker (playwright.config.ts blocks it elsewhere).
test.use({ serviceWorkers: 'allow' });

test('after one visit the app opens, writes and reads a PDF with no network', async ({ page, context }) => {
  const failed: string[] = [];
  page.on('requestfailed', (request) => failed.push(request.url()));

  await page.goto('./');
  // Shown once the service worker has stored every file (about 320). That takes
  // 5 s alone and over 30 s when the whole suite runs in parallel.
  test.setTimeout(120_000);
  await expect(page.getByText('TypeNote is ready to work offline.')).toBeVisible({ timeout: 90_000 });
  // The first visit is not controlled by the worker; the reload below is.
  await page.evaluate(() => navigator.serviceWorker.ready);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'No notebooks yet' })).toBeVisible();

  // The editor screen is a separate file, loaded only now.
  await page.getByRole('main').getByRole('button', { name: 'New loose page' }).click();
  await page.getByLabel('Page title').fill('Written on a train');
  await page.getByLabel('Page text').click();
  await page.keyboard.type('No signal here.');
  await expect(page.getByText(/Saved on this device at/)).toBeVisible();

  // PDF.js: its worker and the standard font for Helvetica come from the cache.
  await page.keyboard.press('Enter');
  await page.keyboard.type('/pdf');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Enter');
  const pdf = makePdf([['Offline reading works.']]);
  await page.locator('[data-type="pdf"] input[type=file]').setInputFiles({ name: 'Timetable.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByText('PDF · 1 page')).toBeVisible();
  await page.getByRole('button', { name: 'Open Timetable' }).click();
  await expect(page.locator('[data-page="1"] .textLayer')).toContainText('Offline reading works.');

  // The typing test is a separate file too.
  await page.goto('./#/typing');
  await expect(page.getByRole('heading', { level: 1, name: 'Typing test' })).toBeVisible();

  expect(failed).toEqual([]);
});
