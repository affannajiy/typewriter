import { Editor } from '@tiptap/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import { db } from '@/database/db';
import { addAttachment, getAttachment, listAttachments } from '@/database/repositories/attachments';
import { createPage, savePageDraft } from '@/database/repositories/pages';
import { RichEditor } from '@/features/editor/RichEditor';
import { withBlockIds } from '@/features/editor/blockIds';
import { BLOCK_COMMANDS, EDITOR_COMMANDS, filterCommands } from '@/features/editor/commands';
import { isReadableDoc, schemaExtensions } from '@/features/editor/extensions';
import type { Typewriter } from '@/features/pages/useTypewriter';
import { openPdf } from '@/services/pdf';
import type { DocNode } from '@/types/models';
import { FilesScreen } from './FilesScreen';

vi.mock('@/services/pdf', () => ({ openPdf: vi.fn() }));
const mockedOpen = vi.mocked(openPdf);

const silent = { on: false, edit: () => {}, follow: () => {}, onKeyDown: () => {}, onKeyUp: () => {} } as unknown as Typewriter;
const doc = (...content: DocNode[]): DocNode => ({ type: 'doc', content });
const p = (text: string): DocNode => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const pdfBytes = () => new TextEncoder().encode('%PDF-1.7\n%%EOF').buffer;

function renderEditor(initial: DocNode) {
  const onChange = vi.fn<(doc: DocNode) => void>();
  const view = render(
    <ToastProvider>
      <RichEditor initial={initial} editable layout="continuous" pageSize="a4" pageMargin="normal" typewriter={silent} onChange={onChange} />
    </ToastProvider>,
  );
  return { onChange, container: view.container };
}

const blockIds = (node: DocNode | undefined, type: string): unknown[] => (node?.content ?? []).filter((n) => n.type === type).map((n) => n.attrs?.attachmentId);

beforeEach(async () => {
  await db.delete();
  await db.open();
  mockedOpen.mockReset();
});

describe('file blocks in the document', () => {
  it('are part of the schema, carry block IDs and add no text', () => {
    const stored = doc(p('Notes'), { type: 'pdf', attrs: { attachmentId: 'a1', id: 'b1' } }, { type: 'audio', attrs: { attachmentId: null } });
    expect(isReadableDoc(stored)).toBe(true);
    const editor = new Editor({ element: document.createElement('div'), extensions: schemaExtensions(), content: withBlockIds(stored) });
    const json = editor.getJSON() as DocNode;
    expect(json.content?.[1]).toMatchObject({ type: 'pdf', attrs: { attachmentId: 'a1', id: 'b1' } });
    expect(json.content?.[2]?.attrs?.id).toEqual(expect.any(String));
    expect(editor.getText({ blockSeparator: '\n' }).trim()).toBe('Notes');
    editor.destroy();
  });

  it('are offered by the slash menu and the toolbar, and inserted empty', () => {
    expect(filterCommands(BLOCK_COMMANDS, 'record').map((c) => c.id)).toEqual(['audio']);
    expect(filterCommands(BLOCK_COMMANDS, 'pdf').map((c) => c.id)).toEqual(['pdf']);
    expect(filterCommands(BLOCK_COMMANDS, 'lecture').map((c) => c.id)).toEqual(['audio']);
    const editor = new Editor({ element: document.createElement('div'), extensions: schemaExtensions(), content: doc(p('x')) });
    EDITOR_COMMANDS.find((c) => c.id === 'pdf')!.turnInto!(editor);
    EDITOR_COMMANDS.find((c) => c.id === 'audio')!.turnInto!(editor);
    const json = editor.getJSON() as DocNode;
    expect(blockIds(json, 'pdf')).toEqual([null]);
    expect(blockIds(json, 'audio')).toEqual([null]);
    editor.destroy();
  });

  it('Enter on a selected PDF opens it', () => {
    const opened: string[] = [];
    const editor = new Editor({ element: document.createElement('div'), extensions: schemaExtensions({}, { pdf: { onOpen: (id) => opened.push(id) } }), content: doc({ type: 'pdf', attrs: { attachmentId: 'a1' } }, p('After')) });
    editor.commands.setNodeSelection(0);
    editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, new KeyboardEvent('keydown', { key: 'Enter' })));
    expect(opened).toEqual(['a1']);
    editor.destroy();
  });
});

describe('the PDF block', () => {
  it('stores a chosen PDF with its page count and shows it', async () => {
    mockedOpen.mockResolvedValue({ pageCount: 12, destroy: vi.fn() } as unknown as Awaited<ReturnType<typeof openPdf>>);
    const { onChange, container } = renderEditor(doc({ type: 'pdf', attrs: { attachmentId: null } }));
    expect(screen.getByText(/Choose a PDF to keep it in this page/)).toBeInTheDocument();
    const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
    await userEvent.upload(input, new File([pdfBytes()], 'Reading list.pdf', { type: 'application/pdf' }));

    await waitFor(() => expect(blockIds(onChange.mock.calls.at(-1)?.[0], 'pdf')).toEqual([expect.any(String)]));
    const [file] = await listAttachments();
    expect(file).toMatchObject({ kind: 'pdf', name: 'Reading list', pageCount: 12 });
    expect(await screen.findByText('Reading list')).toBeInTheDocument();
    expect(screen.getByText(/PDF · 12 pages/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Reading list' })).toBeInTheDocument();
  });

  it('refuses a file PDF.js cannot open, and says so', async () => {
    mockedOpen.mockRejectedValue(new Error('Invalid PDF structure'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = renderEditor(doc({ type: 'pdf', attrs: { attachmentId: null } }));
    await userEvent.upload(container.querySelector<HTMLInputElement>('input[type=file]')!, new File([pdfBytes()], 'broken.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText(/not a PDF that TypeNote can read/)).toBeInTheDocument();
    expect(await listAttachments()).toEqual([]);
  });

  it('says so when its file is not on this device', async () => {
    renderEditor(doc({ type: 'pdf', attrs: { attachmentId: 'elsewhere' } }));
    expect(await screen.findByText(/This file is not on this device/)).toBeInTheDocument();
  });
});

/** A MediaRecorder that hands back three bytes when stopped. */
class FakeRecorder extends EventTarget {
  static isTypeSupported = (type: string) => type === 'audio/webm;codecs=opus';
  state = 'inactive';
  mimeType = 'audio/webm;codecs=opus';
  start() {
    this.state = 'recording';
  }
  pause() {
    this.state = 'paused';
  }
  resume() {
    this.state = 'recording';
  }
  stop() {
    const event = new Event('dataavailable') as Event & { data: Blob };
    event.data = new Blob([new Uint8Array([1, 2, 3])]);
    this.dispatchEvent(event);
    this.state = 'inactive';
    this.dispatchEvent(new Event('stop'));
  }
}

describe('the recording block', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  });

  it('records, pauses, and saves the recording into the block', async () => {
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    const stop = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) } });
    const user = userEvent.setup();
    const { onChange } = renderEditor(doc({ type: 'audio', attrs: { attachmentId: null } }));

    await user.click(screen.getByRole('button', { name: 'Record' }));
    expect(await screen.findByText(/^Recording, 0:0\d$/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByText(/^Paused at/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    await user.click(screen.getByRole('button', { name: 'Stop and save' }));

    expect(await screen.findByText(/^Recording saved/)).toBeInTheDocument();
    const [file] = await listAttachments();
    expect(file).toMatchObject({ kind: 'audio', mimeType: 'audio/webm;codecs=opus', size: 3 });
    expect(file!.name).toMatch(/^Recording /);
    await waitFor(() => expect(blockIds(onChange.mock.calls.at(-1)?.[0], 'audio')).toEqual([file!.id]));
    expect(stop).toHaveBeenCalled();
    expect(await screen.findByLabelText(`Play ${file!.name}`)).toBeInTheDocument();
  });

  it('explains a refused microphone and keeps the block empty', async () => {
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError')) } });
    renderEditor(doc({ type: 'audio', attrs: { attachmentId: null } }));
    await userEvent.click(screen.getByRole('button', { name: 'Record' }));
    expect(await screen.findByText(/may not use the microphone/)).toBeInTheDocument();
    expect(await listAttachments()).toEqual([]);
  });

  it('offers only a sound file where the browser cannot record', () => {
    renderEditor(doc({ type: 'audio', attrs: { attachmentId: null } }));
    expect(screen.queryByRole('button', { name: 'Record' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose a sound file' })).toBeInTheDocument();
    expect(screen.getByText(/This browser cannot record sound/)).toBeInTheDocument();
  });
});

describe('the Files screen', () => {
  const renderScreen = () =>
    render(
      <ToastProvider>
        <MemoryRouter>
          <FilesScreen />
        </MemoryRouter>
      </ToastProvider>,
    );

  it('says how to add files when there are none', async () => {
    renderScreen();
    expect(await screen.findByText('No files yet')).toBeInTheDocument();
  });

  it('shows where each file is used, filters by kind, and deletes only a file no page uses, after asking', async () => {
    const used = await addAttachment({ kind: 'pdf', name: 'Syllabus', mimeType: 'application/pdf', bytes: pdfBytes(), pageCount: 4 });
    const unused = await addAttachment({ kind: 'audio', name: 'Old memo', mimeType: 'audio/webm', bytes: new Uint8Array([1, 2]).buffer, durationMs: 61_000 });
    const page = await createPage({ title: 'Week 1' });
    await savePageDraft(page.id, { title: 'Week 1', content: doc(p('Read'), { type: 'pdf', attrs: { attachmentId: used.id } }) });
    const user = userEvent.setup();
    renderScreen();

    const usedRow = (await screen.findByRole('link', { name: 'Syllabus' })).closest('li')!;
    expect(within(usedRow).getByRole('link', { name: 'Week 1' })).toHaveAttribute('href', `/page/${page.id}`);
    expect(within(usedRow).getByText(/PDF · 4 pages/)).toBeInTheDocument();
    const unusedRow = screen.getByText('Old memo').closest('li')!;
    expect(within(unusedRow).getByText(/Not in any page/)).toBeInTheDocument();
    expect(within(unusedRow).getByText(/Recording · 1:01/)).toBeInTheDocument();
    expect(screen.getByText(/2 files,/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'PDFs' }));
    expect(screen.queryByText('Old memo')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'All' }));

    // A file in a page cannot be deleted from here.
    await user.click(within(usedRow).getByRole('button', { name: 'Actions for Syllabus' }));
    expect(screen.getByRole('menuitem', { name: 'Delete permanently' })).toBeDisabled();
    await user.keyboard('{Escape}');

    await user.click(within(screen.getByText('Old memo').closest('li')!).getByRole('button', { name: 'Actions for Old memo' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete permanently' }));
    const dialog = await screen.findByRole('dialog', { name: /Delete “Old memo” permanently/ });
    expect(within(dialog).getByRole('button', { name: 'Keep file' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }));

    await waitFor(async () => expect(await getAttachment(unused.id)).toBeUndefined());
    expect(await getAttachment(used.id)).toBeDefined();
    await act(async () => {});
  });

  it('renames a file', async () => {
    const file = await addAttachment({ kind: 'audio', name: 'Memo', mimeType: 'audio/webm', bytes: new Uint8Array([1]).buffer });
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Actions for Memo' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const field = await screen.findByRole('textbox', { name: 'Name' });
    await user.clear(field);
    await user.type(field, 'Interview{Enter}');
    await waitFor(async () => expect((await getAttachment(file.id))?.name).toBe('Interview'));
  });
});
