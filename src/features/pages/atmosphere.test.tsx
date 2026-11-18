import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import { db } from '@/database/db';
import { createPage } from '@/database/repositories/pages';
import { readSettings, writeSetting } from '@/database/repositories/settings';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { DEFAULT_SETTINGS, resolveSettings } from '@/features/settings/model';
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
  it('default to the typewriter: mono type and sounds on; medium, normal spacing, plain paper; and refuse unknown values', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ editorFont: 'mono', typingSound: true, editorSize: 'medium', editorLeading: 'normal', editorWidth: 'normal', paperStyle: 'plain', focusDim: true });
    expect(resolveSettings({ editorFont: 'comic', editorSize: 7, paperStyle: 'music', focusDim: 'yes', typingSound: 'loud' })).toMatchObject({ editorFont: 'mono', editorSize: 'medium', paperStyle: 'plain', focusDim: true, typingSound: true });
    // Settings removed in 0.8.0 are ignored when they are still stored.
    expect(resolveSettings({ dailyGoal: 750, studyRetention: 90 })).not.toHaveProperty('dailyGoal');
  });

  it('are applied to the page as they change', async () => {
    const { article } = await openPage();
    expect(article.dataset).toMatchObject({ font: 'mono', size: 'medium', leading: 'normal', width: 'normal', paper: 'plain' });
    await writeSetting('editorFont', 'serif');
    await writeSetting('paperStyle', 'lined');
    await writeSetting('editorLeading', 'loose');
    await waitFor(() => expect(article.dataset).toMatchObject({ font: 'serif', paper: 'lined', leading: 'loose' }));
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
    await userEvent.click(screen.getByRole('radio', { name: 'Book' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Squared' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Office' }));
    await waitFor(async () => expect(resolveSettings(await readSettings())).toMatchObject({ editorFont: 'serif', paperStyle: 'grid', soundMachine: 'office' }));
    const sample = screen.getByRole('img', { name: 'Sample of the page text' });
    await waitFor(() => expect(sample.dataset).toMatchObject({ font: 'serif', paper: 'grid' }));
  });
});

