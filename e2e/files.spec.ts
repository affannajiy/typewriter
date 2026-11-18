import { type Page, expect, test } from '@playwright/test';
import { makePdf } from './pdfFixture';

/**
 * Milestone 6 journeys: a PDF read and highlighted in the reader, and a sound
 * recorded with the microphone. Both run on the production build, under its
 * Content Security Policy, so a blocked worker, font or blob: URL fails here.
 */

// Chromium's stand-in microphone plays a tone, and its permission prompt is answered yes.
test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });

function watchPolicy(page: Page): string[] {
  const refused: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) refused.push(message.text());
  });
  return refused;
}

async function newPageWithTitle(page: Page, title: string) {
  await page.goto('./');
  await page.getByRole('main').getByRole('button', { name: 'New loose page' }).click();
  await page.getByLabel('Page title').fill(title);
  await page.getByLabel('Page text').click();
}

async function slash(page: Page, query: string) {
  await page.keyboard.type(`/${query}`);
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Enter');
}

/** Selects the whole text of one span of a PDF page's text layer, as a reader's drag would. */
async function selectPdfText(page: Page, pageNumber: number, text: string) {
  const span = page.locator(`[data-page="${pageNumber}"] .textLayer span`, { hasText: text }).first();
  await expect(span).toBeAttached();
  await span.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  return span;
}

/** How much of the text's box the highlight covers, 0 to 1. */
async function coverage(page: Page, span: ReturnType<Page['locator']>) {
  const text = (await span.boundingBox())!;
  const mark = (await page.locator('.tn-highlight').first().boundingBox())!;
  const width = Math.min(text.x + text.width, mark.x + mark.width) - Math.max(text.x, mark.x);
  const height = Math.min(text.y + text.height, mark.y + mark.height) - Math.max(text.y, mark.y);
  return Math.max(0, width) * Math.max(0, height) / (text.width * text.height);
}

test('a PDF is kept in a page, read, highlighted with a note, and the highlight survives zoom and reload', async ({ page }) => {
  const refused = watchPolicy(page);
  await newPageWithTitle(page, 'Seminar');
  await page.keyboard.type('Reading for Tuesday:');
  await page.keyboard.press('Enter');
  await slash(page, 'pdf');

  const pdf = makePdf([
    ['Photosynthesis turns light into sugar.', 'Plants need water and carbon dioxide.'],
    ['Chlorophyll absorbs red and blue light.'],
  ]);
  await page.locator('[data-type="pdf"] input[type=file]').setInputFiles({ name: 'Biology reading.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByText('PDF · 2 pages')).toBeVisible();
  await expect(page.getByText(/Saved on this device at/)).toBeVisible();

  await page.getByRole('button', { name: 'Open Biology reading' }).click();
  await expect(page).toHaveURL(/#\/file\//);
  await expect(page.getByRole('heading', { level: 1, name: 'Biology reading' })).toBeVisible();
  await expect(page.locator('[data-page]')).toHaveCount(2);

  // The page is painted, and its text can be selected.
  const painted = await page.locator('[data-page="1"] canvas').evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! < 128) dark++;
    return dark;
  });
  expect(painted).toBeGreaterThan(100);

  const span = await selectPdfText(page, 1, 'Photosynthesis');
  await page.getByRole('button', { name: 'Highlight in Yellow' }).click();
  await expect(page.getByText('Highlighted.')).toBeVisible();
  await expect(page.locator('.tn-highlight[data-colour="yellow"]')).toHaveCount(1);
  expect(await coverage(page, span)).toBeGreaterThan(0.8);

  // The note, in the panel (closed by default on a narrow screen).
  const notes = page.getByRole('complementary', { name: 'Highlights and notes' });
  if (!(await notes.isVisible())) await page.getByRole('button', { name: 'Show highlights and notes' }).click();
  await expect(notes.getByText('Photosynthesis turns light into sugar.')).toBeVisible();
  await notes.getByLabel('Note on the highlight on page 1').fill('Equation in lecture 3.');
  await expect(notes.getByText('Note saved')).toBeVisible();

  // Zooming repaints the page; the highlight stays on its words.
  const zoom = page.getByText(/^\d+ %$/);
  const before = await zoom.textContent();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(zoom).not.toHaveText(before!);
  await expect(span).toBeAttached();
  await expect.poll(() => coverage(page, page.locator('[data-page="1"] .textLayer span', { hasText: 'Photosynthesis' }).first())).toBeGreaterThan(0.8);

  // Go to page 2 by number.
  await page.getByLabel('Go to page, 1 to 2').fill('2');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-page="2"] .textLayer span', { hasText: 'Chlorophyll' })).toBeInViewport();

  await page.reload();
  await expect(page.locator('.tn-highlight[data-colour="yellow"]')).toHaveCount(1);
  if (!(await notes.isVisible())) await page.getByRole('button', { name: 'Show highlights and notes' }).click();
  await expect(notes.getByLabel('Note on the highlight on page 1')).toHaveValue('Equation in lecture 3.');

  // Search finds words inside the PDF, says on which page, and opens the reader there with the words marked.
  await page.goto('./');
  await page.getByRole('searchbox', { name: 'Search all notebooks' }).fill('chlorophyll');
  const result = page.getByRole('region', { name: 'Loose pages' }).getByRole('link', { name: /Biology reading/ });
  await expect(result).toContainText('PDF in “Seminar” · page 2');
  await result.click();
  await expect(page.locator('[data-page="2"] .tn-pdf-match').first()).toHaveText(/chlorophyll/i);
  await expect(page.locator('[data-page="2"]')).toBeInViewport();

  expect(refused).toEqual([]);
});

test.describe('with a microphone', () => {
  test.use({ permissions: ['microphone'] });

  test('a recording is made in a page, plays back, survives a reload, and downloads from its block', async ({ page }) => {
    const refused = watchPolicy(page);
    await newPageWithTitle(page, 'Lecture 4');
    await slash(page, 'record');

    await page.getByRole('button', { name: 'Record', exact: true }).click();
    await expect(page.getByText(/^Recording, 0:0\d$/)).toBeVisible();
    await expect(page.getByText('Recording, 0:02')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Stop and save' }).click();
    await expect(page.getByText(/^Recording saved \(0:0[2-9]\)\.$/)).toBeVisible();
    await expect(page.getByText(/Saved on this device at/)).toBeVisible();

    const player = page.getByLabel(/^Play Recording /);
    await expect(player).toBeVisible();
    // The browser can read the stored sound: the blob: URL is allowed and the data decodes.
    await expect.poll(() => player.evaluate((audio: HTMLAudioElement) => audio.readyState)).toBeGreaterThanOrEqual(1);
    expect(await player.evaluate((audio: HTMLAudioElement) => audio.error)).toBeNull();
    await expect(page.getByText(/^Recording · 0:0[2-9] · /)).toBeVisible();

    await page.reload();
    await expect(page.getByLabel(/^Play Recording /)).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /^Download Recording / }).click();
    expect((await download).suggestedFilename()).toMatch(/^Recording .+\.(webm|ogg|m4a)$/);

    expect(refused).toEqual([]);
  });
});
