import { type Page, expect, test } from '@playwright/test';

/**
 * Milestone 7 journeys: pages linked with "[[", their backlinks and the graph,
 * an equation drawn by KaTeX, and a flashcard made from a page and studied.
 * They run on the production build, under its Content Security Policy, so a
 * blocked KaTeX font or style fails here.
 */

function watchPolicy(page: Page): string[] {
  const refused: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) refused.push(message.text());
  });
  return refused;
}

async function newPageWithTitle(page: Page, title: string) {
  await page.goto('./');
  await page.getByRole('main').getByRole('button', { name: 'New page' }).click();
  await page.getByLabel('Page title').fill(title);
  await page.getByLabel('Page text').click();
}

const editor = (page: Page) => page.getByLabel('Page text');

test('pages are linked with [[, show their backlinks and appear in the graph; an equation is drawn', async ({ page }) => {
  const refused = watchPolicy(page);
  await newPageWithTitle(page, 'Photosynthesis');
  await page.keyboard.type('Light is caught by ');
  await page.keyboard.type('[[Chlorophyll');
  const menu = page.getByRole('listbox', { name: 'Pages to link to' });
  await expect(menu.getByRole('option', { name: 'Create page “Chlorophyll”' })).toBeVisible();
  await page.keyboard.press('Enter');
  const link = editor(page).getByRole('link', { name: 'Chlorophyll' });
  await expect(link).toBeVisible();

  // An inline equation, typed between dollar signs, drawn with KaTeX's own fonts.
  await page.keyboard.type('and the energy is $E = hf$ per photon.');
  const equation = editor(page).locator('[data-type="math-inline"] .katex');
  await expect(equation).toBeVisible();
  await expect(editor(page).getByRole('button', { name: 'Equation: E = hf' })).toBeVisible();
  await expect.poll(() => equation.evaluate(() => document.fonts.check('16px KaTeX_Math'))).toBe(true);
  await expect(page.getByText(/Saved on this device at/)).toBeVisible();

  // The linked page was made, in the same place, and knows who links to it.
  await link.click();
  await expect(page.getByLabel('Page title')).toHaveValue('Chlorophyll');
  const linkedFrom = page.getByRole('region', { name: 'Linked from' });
  await expect(linkedFrom.getByRole('link', { name: 'Photosynthesis' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Linked from' }).getByRole('link', { name: 'Photosynthesis' })).toBeVisible();

  // Back on the first page: the link shows the linked page's current title.
  await page.getByLabel('Page title').fill('Chlorophyll a');
  await expect(page.getByText(/Saved on this device at/)).toBeVisible();
  await page.getByRole('region', { name: 'Linked from' }).getByRole('link', { name: 'Photosynthesis' }).click();
  await expect(editor(page).getByRole('link', { name: 'Chlorophyll a' })).toBeVisible();

  // The graph: two pages and one link, each page a link to it, and the same as a list.
  await page.goto('./#/graph');
  const graph = page.getByRole('group', { name: /Graph of 2 pages and 1 link/ });
  await expect(graph).toBeVisible();
  await expect(graph.getByRole('link', { name: 'Photosynthesis, 1 link' })).toBeVisible();
  await graph.getByRole('link', { name: 'Chlorophyll a, 1 link' }).click();
  await expect(page.getByLabel('Page title')).toHaveValue('Chlorophyll a');
  expect(refused).toEqual([]);
});

test('a flashcard is made from a page, studied with the keyboard, and scheduled', async ({ page }) => {
  const refused = watchPolicy(page);
  await newPageWithTitle(page, 'Cells');
  await page.keyboard.type('The mitochondrion makes ATP for the cell.');
  await expect(page.getByText(/Saved on this device at/)).toBeVisible();

  // The card starts from the paragraph with the caret. With no deck yet, the dialog makes one.
  await page.getByRole('button', { name: 'Make a flashcard' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add card' });
  await expect(dialog.getByLabel('Question')).toHaveValue('The mitochondrion makes ATP for the cell.');
  await dialog.getByLabel('Question').fill('What makes ATP for the cell?');
  await dialog.getByLabel('Answer').fill('The mitochondrion, about $30$ ATP per glucose');
  await dialog.getByLabel('Deck').fill('Biology');
  await expect(dialog.locator('.katex')).toBeVisible();
  await dialog.getByRole('button', { name: 'Add card' }).click();
  await expect(page.getByText('Card added.')).toBeVisible();

  await page.goto('./#/study');
  await expect(page.getByRole('link', { name: 'Biology', exact: true })).toBeVisible();
  await expect(page.getByText('1 card · 1 new · 0 learning · 0 due')).toBeVisible();
  await page.getByRole('link', { name: 'Study Biology' }).click();

  await expect(page.getByText('What makes ATP for the cell?')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByText(/The mitochondrion, about/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Good.*next in 10 min/ })).toBeVisible();
  await page.keyboard.press('3');
  // A learning step of ten minutes: the card is shown again before the session ends.
  await expect(page.getByText('1 answered · 1 to go')).toBeVisible();
  await page.keyboard.press('Space');
  await page.keyboard.press('4');
  await expect(page.getByRole('heading', { name: 'Done for now' })).toBeVisible();
  await expect(page.getByText(/You answered 2 cards\. Next card due in \d+ days?\./)).toBeVisible();

  // Undo takes the last answer back, and it is kept across a reload.
  await page.keyboard.press('z');
  await expect(page.getByText('Last answer undone.')).toBeVisible();
  await expect(page.getByText('What makes ATP for the cell?')).toBeVisible();
  await page.keyboard.press('Space');
  await page.keyboard.press('3');
  await expect(page.getByRole('heading', { name: 'Done for now' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Done for now' })).toBeVisible();

  // The card remembers the page it came from; the desk says nothing is due.
  await page.goto('./#/study');
  await page.getByRole('link', { name: 'Biology', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Cells' })).toBeVisible();
  await page.goto('./');
  await expect(page.getByText('Nothing to study right now.')).toBeVisible();
  expect(refused).toEqual([]);
});
