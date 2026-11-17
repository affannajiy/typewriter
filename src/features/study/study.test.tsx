import { Editor } from '@tiptap/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import { db } from '@/database/db';
import { createCard, createDeck, getCard, listReviewLogs } from '@/database/repositories/flashcards';
import { docToPlainText } from '@/database/repositories/pages';
import { withBlockIds } from '@/features/editor/blockIds';
import { BLOCK_COMMANDS, filterCommands } from '@/features/editor/commands';
import { isReadableDoc, schemaExtensions } from '@/features/editor/extensions';
import type { DocNode } from '@/types/models';
import ReviewScreen from './ReviewScreen';

const doc = (...content: DocNode[]): DocNode => ({ type: 'doc', content });
const p = (...content: DocNode[]): DocNode => ({ type: 'paragraph', content });
const text = (value: string): DocNode => ({ type: 'text', text: value });

function editorWith(content: DocNode) {
  return new Editor({ element: document.createElement('div'), extensions: schemaExtensions(), content: withBlockIds(content) });
}

/** Types as a keyboard would, so input rules run. */
function type(editor: Editor, value: string) {
  for (const char of value) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp('handleTextInput', (handler) => handler(editor.view, from, to, char, () => editor.state.tr.insertText(char, from, to)));
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(char, from, to));
  }
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('equations and page links in the document', () => {
  it('are part of the schema, keep their attributes, and an equation block gets a block ID', () => {
    const stored = doc(p(text('Area '), { type: 'mathInline', attrs: { latex: '\\pi r^2' } }, text(' see '), { type: 'pageLink', attrs: { pageId: 'p2', title: 'Circles' } }), { type: 'mathBlock', attrs: { latex: 'e^{i\\pi}+1=0' } });
    expect(isReadableDoc(stored)).toBe(true);
    const editor = editorWith(stored);
    const json = editor.getJSON() as DocNode;
    expect(json.content?.[0]?.content?.[1]).toEqual({ type: 'mathInline', attrs: { latex: '\\pi r^2' } });
    expect(json.content?.[0]?.content?.[3]).toEqual({ type: 'pageLink', attrs: { pageId: 'p2', title: 'Circles' } });
    expect(json.content?.[1]).toMatchObject({ type: 'mathBlock', attrs: { latex: 'e^{i\\pi}+1=0', id: expect.any(String) } });
    editor.destroy();
  });

  it('put the formula source and the link title in the searchable text', () => {
    const content = doc(p(text('Area '), { type: 'mathInline', attrs: { latex: '\\pi r^2' } }, text(', see '), { type: 'pageLink', attrs: { pageId: 'p2', title: 'Circles' } }), { type: 'mathBlock', attrs: { latex: 'E = mc^2' } });
    expect(docToPlainText(content)).toBe('Area \\pi r^2, see Circles\nE = mc^2');
  });

  it('turn "$x^2$" into an inline equation, and leave prices alone', () => {
    const editor = editorWith(doc(p()));
    editor.commands.focus('end');
    type(editor, 'Then $x^2$ and costs $5 and $6');
    const paragraph = (editor.getJSON() as DocNode).content![0]!;
    expect(paragraph.content).toEqual([text('Then '), { type: 'mathInline', attrs: { latex: 'x^2' } }, text(' and costs $5 and $6')]);
    editor.destroy();
  });

  it('turn "$$ " on an empty line into an equation block', () => {
    const editor = editorWith(doc(p(text('Before')), p()));
    editor.commands.focus('end');
    type(editor, '$$ ');
    const blocks = (editor.getJSON() as DocNode).content!;
    expect(blocks.map((block) => block.type)).toContain('mathBlock');
    expect(blocks.find((block) => block.type === 'mathBlock')?.attrs?.latex).toBe('');
    editor.destroy();
  });

  it('are offered by the slash menu', () => {
    expect(filterCommands(BLOCK_COMMANDS, 'equation').map((c) => c.id)).toEqual(['mathBlock', 'mathInline']);
    expect(filterCommands(BLOCK_COMMANDS, 'latex').map((c) => c.id)).toEqual(['mathBlock', 'mathInline']);
    expect(filterCommands(BLOCK_COMMANDS, 'link').map((c) => c.id)).toEqual(['pageLink']);
  });

  it('start a page link by typing "[["', () => {
    const editor = editorWith(doc(p()));
    editor.commands.focus('end');
    editor.commands.startPageLink();
    expect(editor.getText()).toBe('[[');
    editor.destroy();
  });
});

function renderReview() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/study/review/all']}>
        <Routes>
          <Route path="/study/review/:deckId" element={<ReviewScreen />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('a study session', () => {
  it('shows a question, reveals the answer, takes an answer from the keyboard, and undoes it', async () => {
    const deck = await createDeck({ name: 'Maths' });
    const first = await createCard({ deckId: deck.id, front: 'Two plus two?', back: 'Four' });
    await createCard({ deckId: deck.id, front: 'Area of a circle?', back: '$\\pi r^2$' });
    const user = userEvent.setup();
    renderReview();

    expect(await screen.findByText('Two plus two?')).toBeInTheDocument();
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('0 answered · 2 to go');
    expect(screen.queryByText('Four')).not.toBeInTheDocument();

    await user.keyboard(' ');
    expect(await screen.findByText('Four')).toBeInTheDocument();
    const good = screen.getByRole('button', { name: /Good/ });
    expect(good).toHaveTextContent(/next in 10 min/);

    await user.keyboard('3');
    expect(await screen.findByText('Area of a circle?')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('status')[0]).toHaveTextContent('1 answered'));
    expect(await getCard(first.id)).toMatchObject({ state: 'learning', reps: 1 });
    expect(await listReviewLogs(0)).toHaveLength(1);

    await user.keyboard('z');
    await waitFor(async () => expect(await getCard(first.id)).toMatchObject({ state: 'new', reps: 0 }));
    expect(await screen.findByText('Two plus two?')).toBeInTheDocument();
    expect(await listReviewLogs(0)).toHaveLength(0);
  });

  it('says when there is nothing left to study', async () => {
    await createDeck({ name: 'Empty' });
    renderReview();
    expect(await screen.findByText('Done for now')).toBeInTheDocument();
    await act(async () => {});
  });
});
