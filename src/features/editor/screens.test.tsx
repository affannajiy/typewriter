import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import { db } from '@/database/db';
import { createNotebook } from '@/database/repositories/notebooks';
import { createPage, getPage, savePageDraft, setPageLayout } from '@/database/repositories/pages';
import { textToDoc } from '@/features/pages/plainDoc';
import type { Typewriter } from '@/features/pages/useTypewriter';
import { CommandPalette } from '@/features/search/CommandPalette';
import { DEFAULT_SETTINGS, resolveSettings } from '@/features/settings/model';
import type { DocNode } from '@/types/models';
import { RichEditor } from './RichEditor';

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
});

const silent: Typewriter = { on: false, edit: vi.fn(), onInput: vi.fn(), follow: vi.fn(), onKeyDown: vi.fn(), onKeyUp: vi.fn(), feedPaper: vi.fn() };

function renderEditor(initial: DocNode, editable = true) {
  const onChange = vi.fn<(doc: DocNode) => void>();
  render(
    <ToastProvider>
      <RichEditor initial={initial} editable={editable} layout="continuous" pageSize="a4" pageMargin="normal" typewriter={silent} onChange={onChange} />
    </ToastProvider>,
  );
  return { onChange, body: screen.getByRole('textbox', { name: 'Page text' }) };
}

const lastDoc = (onChange: ReturnType<typeof vi.fn<(doc: DocNode) => void>>) => onChange.mock.calls.at(-1)![0];

describe('the page editor', () => {
  it('shows a stored plain-text page and does not report a change on opening', () => {
    const { onChange, body } = renderEditor(textToDoc('First line\nSecond line'));
    expect(within(body).getByText('First line')).toBeInTheDocument();
    expect(within(body).getByText('Second line')).toBeInTheDocument();
    expect(body).toHaveAttribute('contenteditable', 'true');
    expect(body).toHaveAttribute('aria-multiline', 'true');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('formats from the toolbar and reports the new document', async () => {
    const { onChange } = renderEditor(textToDoc('Chapter one'));
    const heading = screen.getByRole('button', { name: /^Heading 2/ });
    expect(heading).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(heading);
    await waitFor(() => expect(heading).toHaveAttribute('aria-pressed', 'true'));
    expect(lastDoc(onChange).content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Chapter one' }] });
    // The block kept an ID through the change of type.
    expect(lastDoc(onChange).content?.[0]?.attrs?.id).toEqual(expect.any(String));

    await userEvent.click(screen.getByRole('button', { name: /^Checklist/ }));
    expect(lastDoc(onChange).content?.[0]).toMatchObject({ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false } }] });
    // A real checkbox with a name, so the state is not shown by colour alone.
    expect(screen.getByRole('checkbox', { name: /Not done/ })).not.toBeChecked();
  });

  it('the toolbar is one tab stop, and arrow keys move inside it', async () => {
    renderEditor(textToDoc('Text'));
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
    const buttons = within(toolbar).getAllByRole('button');
    expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1);
    buttons[0]!.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(buttons[1]).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(buttons.at(-1)).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(buttons[0]).toHaveFocus();
    // Undo has nothing to undo yet: it says so, but stays reachable.
    expect(screen.getByRole('button', { name: /^Undo/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('every toolbar button has a name, and toggles report their state', () => {
    renderEditor(textToDoc('Text'));
    const buttons = within(screen.getByRole('toolbar')).getAllByRole('button');
    expect(buttons).toHaveLength(18);
    for (const button of buttons) expect(button).toHaveAccessibleName();
    expect(screen.getByRole('button', { name: /^Bold/ })).toHaveAttribute('aria-pressed');
    expect(screen.getByRole('button', { name: 'Drawing' })).not.toHaveAttribute('aria-pressed');
    expect(screen.getByRole('button', { name: 'Divider' })).not.toHaveAttribute('aria-pressed');
  });

  it('the block menu moves, duplicates and deletes with an undo', async () => {
    const { onChange } = renderEditor(textToDoc('one\ntwo'));
    const open = () => userEvent.click(screen.getByRole('button', { name: 'Block actions' }));
    const blocks = () => lastDoc(onChange).content?.map((node) => node.content?.[0]?.text);

    await open();
    // The caret starts in the first block: it cannot go further up.
    expect(screen.getByRole('menuitem', { name: 'Move block up' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'Turn into: Text' })).toBeDisabled();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move block down' }));
    expect(blocks()).toEqual(['two', 'one']);

    await open();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Duplicate block' }));
    expect(blocks()).toEqual(['two', 'one', 'one']);

    await open();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete block' }));
    expect(blocks()).toEqual(['two', 'one']);
    await userEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }));
    expect(blocks()).toEqual(['two', 'one', 'one']);
  });

  it('a page in the Trash cannot be edited and has no toolbar', () => {
    const { body } = renderEditor(textToDoc('Kept as it was'), false);
    expect(body).toHaveAttribute('contenteditable', 'false');
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Block actions' })).not.toBeInTheDocument();
  });
});

describe('page layout and paper settings', () => {
  it('stores the layout as an edit, and only when it changes', async () => {
    const page = await createPage();
    await setPageLayout(page.id, 'paginated');
    expect(await getPage(page.id)).toMatchObject({ layout: 'paginated', rev: 2 });
    await setPageLayout(page.id, 'paginated');
    expect((await getPage(page.id))?.rev).toBe(2);
  });

  it('validates the paper settings', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ pageSize: 'a4', pageMargin: 'normal' });
    expect(resolveSettings({ pageSize: 'letter', pageMargin: 'wide' })).toMatchObject({ pageSize: 'letter', pageMargin: 'wide' });
    expect(resolveSettings({ pageSize: 'a0', pageMargin: 12 })).toMatchObject({ pageSize: 'a4', pageMargin: 'normal' });
  });
});

describe('search and commands', () => {
  function Where() {
    return <p data-testid="where">{useLocation().pathname}</p>;
  }

  function renderPalette() {
    const onClose = vi.fn();
    render(
      <ToastProvider>
        <MemoryRouter>
          <Routes>
            <Route path="*" element={<Where />} />
          </Routes>
          <CommandPalette onClose={onClose} />
        </MemoryRouter>
      </ToastProvider>,
    );
    return { onClose, input: screen.getByRole('combobox', { name: 'Search pages, or type a command' }) };
  }

  it('finds a page by its text and opens it with the keyboard', async () => {
    const notebook = await createNotebook({ name: 'History', description: '', coverColour: '#795b43', folderId: null });
    const page = await createPage({ notebookId: notebook.id, title: 'The Printing Press' });
    await savePageDraft(page.id, { title: 'The Printing Press', content: textToDoc('Gutenberg, around 1440.') });
    await createPage({ title: 'Tide pools' });

    const { onClose, input } = renderPalette();
    await userEvent.type(input, 'gutenberg');
    const option = await screen.findByRole('option', { name: /The Printing Press/ });
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(option).toHaveTextContent('Gutenberg, around 1440.');
    expect(option).toHaveTextContent('Page in History');
    expect(input).toHaveAttribute('aria-activedescendant', option.id);
    expect(screen.queryByRole('option', { name: /Tide pools/ })).not.toBeInTheDocument();

    await userEvent.keyboard('{Enter}');
    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/page/${page.id}`));
  });

  it('lists places to go before anything is typed, and moves with the arrow keys', async () => {
    const { input } = renderPalette();
    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['New page', 'Go to Home', 'Go to Library', 'Go to Tags', 'Go to Trash', 'Go to Settings']);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    input.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(options[2]).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(options.at(-1)).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/settings'));
  });

  it('says so when nothing matches', async () => {
    const { input } = renderPalette();
    await userEvent.type(input, 'zzzz');
    expect(await screen.findByText(/Nothing matches/)).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No results.')).toBeInTheDocument();
  });
});
