import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import { db } from '@/database/db';
import { createPage } from '@/database/repositories/pages';
import { readSettings, writeSetting } from '@/database/repositories/settings';
import { WritingStats } from '@/features/dashboard/WritingStats';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { DEFAULT_SETTINGS, resolveSettings } from '@/features/settings/model';
import type { Page } from '@/types/models';
import { addDays, dayKey } from '@/utils/dates';
import PageScreen from './PageScreen';

// jsdom has no layout. The editor asks for these when it scrolls the caret into view.
beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect;
  const rects = Object.assign([] as DOMRect[], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => rect;
  Range.prototype.getClientRects = () => rects;
  Element.prototype.getClientRects = () => rects;
  document.elementFromPoint = () => null;
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  delete document.documentElement.dataset.focus;
});

async function openPage() {
  const page = await createPage({ title: 'Letters' });
  const view = render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/page/${page.id}`]}>
        <Routes>
          <Route path="/page/:pageId" element={<PageScreen />} />
          <Route path="/" element={<p>Desk</p>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
  await screen.findByRole('textbox', { name: 'Page text' });
  return { page, view, article: document.querySelector<HTMLElement>('.tn-page')! };
}

describe('writing settings on the page', () => {
  it('default to Lora, medium, normal spacing and plain paper, and refuse unknown values', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ editorFont: 'serif', editorSize: 'medium', editorLeading: 'normal', editorWidth: 'normal', paperStyle: 'plain', focusDim: true, dailyGoal: 0 });
    expect(resolveSettings({ editorFont: 'comic', editorSize: 7, paperStyle: 'music', dailyGoal: -1, focusDim: 'yes' })).toMatchObject({ editorFont: 'serif', editorSize: 'medium', paperStyle: 'plain', dailyGoal: 0, focusDim: true });
    expect(resolveSettings({ dailyGoal: 20_001 }).dailyGoal).toBe(0);
    expect(resolveSettings({ dailyGoal: 750 }).dailyGoal).toBe(750);
  });

  it('are applied to the page as they change', async () => {
    const { article } = await openPage();
    expect(article.dataset).toMatchObject({ font: 'serif', size: 'medium', leading: 'normal', width: 'normal', paper: 'plain' });
    await writeSetting('editorFont', 'mono');
    await writeSetting('paperStyle', 'lined');
    await writeSetting('editorLeading', 'loose');
    await waitFor(() => expect(article.dataset).toMatchObject({ font: 'mono', paper: 'lined', leading: 'loose' }));
  });
});

describe('focus mode', () => {
  it('turns on from its button and from the shortcut, and Escape leaves it', async () => {
    await openPage();
    const button = screen.getByRole('button', { name: 'Focus mode' });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(button);
    expect(document.documentElement.dataset.focus).toBe('on');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Focus mode\. Press Escape/)).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(document.documentElement.dataset.focus).toBeUndefined();

    await userEvent.keyboard('{Control>}{Shift>}f{/Shift}{/Control}');
    expect(document.documentElement.dataset.focus).toBe('on');
    await userEvent.keyboard('{Control>}{Shift>}F{/Shift}{/Control}');
    expect(document.documentElement.dataset.focus).toBeUndefined();
  });

  it('ends when the page is left', async () => {
    const { view } = await openPage();
    await userEvent.click(screen.getByRole('button', { name: 'Focus mode' }));
    expect(document.documentElement.dataset.focus).toBe('on');
    view.unmount();
    expect(document.documentElement.dataset.focus).toBeUndefined();
  });

  it('marks the page to fade other blocks only when that is wanted', async () => {
    const { article } = await openPage();
    expect(article).toHaveAttribute('data-dim');
    await writeSetting('focusDim', false);
    await waitFor(() => expect(article).not.toHaveAttribute('data-dim'));
  });
});

describe('the settings screen', () => {
  function renderSettings() {
    render(
      <ToastProvider>
        <MemoryRouter>
          <SettingsScreen />
        </MemoryRouter>
      </ToastProvider>,
    );
  }

  it('stores the typeface, ruling and machine, and shows a sample in them', async () => {
    renderSettings();
    await userEvent.click(screen.getByRole('radio', { name: 'Typewriter' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Squared' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Office' }));
    await waitFor(async () => expect(resolveSettings(await readSettings())).toMatchObject({ editorFont: 'mono', paperStyle: 'grid', soundMachine: 'office' }));
    const sample = screen.getByRole('img', { name: 'Sample of the page text' });
    await waitFor(() => expect(sample.dataset).toMatchObject({ font: 'mono', paper: 'grid' }));
  });

  it('stores a daily goal only when it is a whole number in range', async () => {
    renderSettings();
    const field = screen.getByRole('spinbutton', { name: 'Daily word goal' });
    await userEvent.clear(field);
    await userEvent.type(field, '500');
    await waitFor(async () => expect(resolveSettings(await readSettings()).dailyGoal).toBe(500));
    await userEvent.clear(field);
    await userEvent.type(field, '99999');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveValue(99999);
    expect(resolveSettings(await readSettings()).dailyGoal).toBe(9999);
    // Leaving the field puts the stored goal back.
    await userEvent.tab();
    await waitFor(() => expect(field).toHaveValue(9999));
    expect(field).toHaveAttribute('aria-invalid', 'false');
  });
});

describe('the writing summary on the desk', () => {
  it('shows today against the goal, the streak, the words in pages and seven days with text for each', async () => {
    const today = new Date();
    await db.writingDays.bulkPut([
      { date: dayKey(today), words: 120, updatedAt: 1 },
      { date: dayKey(addDays(today, -1)), words: 300, updatedAt: 1 },
      { date: dayKey(addDays(today, -3)), words: 50, updatedAt: 1 },
    ]);
    const pages = [{ plainText: 'one two three' }, { plainText: 'four five' }] as Page[];
    render(<WritingStats pages={pages} goal={500} />);

    expect(await screen.findByText('120 words')).toBeInTheDocument();
    expect(screen.getByText('120 of 500 words')).toBeInTheDocument();
    expect(screen.getByText('2 days')).toBeInTheDocument();
    expect(screen.getByText('5 words')).toBeInTheDocument();
    const week = within(screen.getByRole('list', { name: 'Last seven days' })).getAllByRole('listitem');
    expect(week).toHaveLength(7);
    expect(week.at(-1)).toHaveTextContent(/: 120 words/);
    expect(week.at(-2)).toHaveTextContent(/: 300 words/);
    expect(week.at(-3)).toHaveTextContent(/: 0 words/);
  });

  it('says how to set a goal when there is none, and marks a goal reached', async () => {
    await db.writingDays.put({ date: dayKey(), words: 800, updatedAt: 1 });
    const { rerender } = render(<WritingStats pages={[]} goal={0} />);
    expect(await screen.findByText(/Set a daily goal/)).toBeInTheDocument();
    rerender(<WritingStats pages={[]} goal={500} />);
    expect(screen.getByText(/Goal reached/)).toBeInTheDocument();
  });
});
