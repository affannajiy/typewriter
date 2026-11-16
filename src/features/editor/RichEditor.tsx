import { EditorContent, useEditor } from '@tiptap/react';
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { copyDrawing } from '@/database/repositories/drawings';
import { DrawingBlock } from '@/features/drawing/DrawingBlock';
import { AudioBlock, PdfBlock } from '@/features/files/FileBlocks';
import type { Typewriter } from '@/features/pages/useTypewriter';
import { t } from '@/i18n/en';
import { measureCaret } from '@/services/carriage';
import type { DocNode, Id, PageLayout } from '@/types/models';
import { SlashMenu } from './SlashMenu';
import { Toolbar } from './Toolbar';
import { setActiveEditor } from './activeEditor';
import { withBlockIds } from './blockIds';
import { type SlashState, editorExtensions } from './extensions';
import { PAGE_GAP, type PageGeometry, type PageMargin, type PageSize, geometryFor, sheetFor } from './pagination';

interface PendingInput {
  inputType: string;
  data: string | null;
  /** True when the browser reported the edit itself, so it happened even if the editor has not caught up. */
  fromBrowser: boolean;
}

const KEY_INPUT: Record<string, string> = { Enter: 'insertParagraph', Backspace: 'deleteContentBackward', Delete: 'deleteContentForward' };

/** Calls the newest version of a callback from a place that was set up once. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

interface RichEditorProps {
  /** The stored document. Read once: afterwards the editor holds the truth. */
  initial: DocNode;
  editable: boolean;
  layout: PageLayout;
  pageSize: PageSize;
  pageMargin: PageMargin;
  typewriter: Typewriter;
  onChange: (doc: DocNode) => void;
  /** Number of sheets in the paginated layout. Always 1 in the continuous layout. */
  onPageCount?: (pages: number) => void;
  /** The page being edited. Drawings belong to it. */
  pageId?: Id;
  /** Opens a drawing full screen. */
  onOpenDrawing?: (drawingId: Id) => void;
  /** Changes whenever the text's size changes (typeface, size, spacing), so sheets are measured again. */
  textMetrics?: string;
}

/** The writing surface: toolbar, rich text, slash menu, and sheets in the paginated layout. */
export function RichEditor({ initial, editable, layout, pageSize, pageMargin, typewriter, onChange, onPageCount, pageId, onOpenDrawing, textMetrics }: RichEditorProps) {
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [pages, setPages] = useState(1);
  const [available, setAvailable] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const slashKeys = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const geometry = useRef<PageGeometry | null>(null);
  const pending = useRef<PendingInput | null>(null);
  const latest = useLatest({ typewriter, onChange, onOpenDrawing });

  /** Remember an edit until the editor reports the change it caused. */
  const expect = (input: PendingInput) => {
    pending.current = input;
    setTimeout(() => {
      if (pending.current !== input) return;
      pending.current = null;
      // No change arrived (text still being composed, for example): the key was struck all the same.
      if (input.fromBrowser) latest.current.typewriter.edit(input.inputType, input.data, null);
    }, 0);
  };

  // The callbacks below run later, on editor events, never during render: reading refs in them is correct.
  /* eslint-disable react-hooks/refs */
  const editor = useEditor({
    extensions: editorExtensions({
      slash: {
        onChange: setSlash,
        onKeyDown: (event) => {
          const used = slashKeys.current(event);
          // Enter that picks a menu entry is not a new line.
          if (used) pending.current = null;
          return used;
        },
      },
      pagination: { getGeometry: () => geometry.current, onPages: setPages },
      drawing: {
        pageId: pageId ?? null,
        view: DrawingBlock,
        onOpen: (drawingId) => latest.current.onOpenDrawing?.(drawingId),
        onCopy: (fromId, toId) => {
          if (pageId) void copyDrawing(fromId, toId, pageId).catch((error: unknown) => console.error(error));
        },
      },
      files: { pdf: { view: PdfBlock }, audio: { view: AudioBlock } },
    }),
    content: withBlockIds(initial),
    editable,
    editorProps: {
      attributes: { 'aria-label': t.page.bodyLabel, 'aria-multiline': 'true', class: 'tn-prose' },
    },
    onUpdate: ({ editor: e, transaction }) => {
      latest.current.onChange(e.getJSON() as DocNode);
      const input = pending.current ?? (transaction.getMeta('paste') ? { inputType: 'insertFromPaste', data: null } : null);
      pending.current = null;
      const { typewriter: sounds } = latest.current;
      if (input && sounds.on) sounds.edit(input.inputType, input.data, measureCaret(e.view));
    },
    onSelectionUpdate: ({ editor: e, transaction }) => {
      const { typewriter: sounds } = latest.current;
      if (!transaction.docChanged && sounds.on) sounds.follow(measureCaret(e.view));
    },
  });
  /* eslint-enable react-hooks/refs */

  useEffect(() => {
    editor.setEditable(editable, false);
  }, [editor, editable]);

  // The command palette offers formatting commands for the open page.
  useEffect(() => {
    if (!editable) return;
    setActiveEditor(editor);
    return () => setActiveEditor(null);
  }, [editor, editable]);

  // Typing that the browser performs itself is announced by a `beforeinput` event.
  // It must be this event and not `input`: the editor reads the changed text
  // between two listeners of `input`, so a note taken there would arrive
  // after the change it describes.
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const onBeforeInput = (event: Event) => {
      const { inputType = '', data = null } = event as InputEvent;
      expect({ inputType, data, fromBrowser: true });
    };
    element.addEventListener('beforeinput', onBeforeInput, true);
    return () => element.removeEventListener('beforeinput', onBeforeInput, true);
    // `expect` only touches refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enter and the delete keys are often handled by the editor before the browser acts, with no input event.
  const onKeyDownCapture = (event: ReactKeyboardEvent) => {
    latest.current.typewriter.onKeyDown(event);
    const inputType = event.shiftKey && event.key === 'Enter' ? 'insertLineBreak' : KEY_INPUT[event.key];
    if (inputType && !event.nativeEvent.isComposing && !event.ctrlKey && !event.metaKey) expect({ inputType, data: null, fromBrowser: false });
  };

  useEffect(() => {
    const element = frame.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setAvailable(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const sheet = useMemo(() => (layout === 'paginated' ? sheetFor(pageSize, pageMargin, available) : null), [layout, pageSize, pageMargin, available]);
  const stride = sheet ? geometryFor(sheet).stride : 0;
  const pageCount = sheet ? pages : 1;

  // Give the pagination plugin the new sheet and ask it to measure again.
  useEffect(() => {
    geometry.current = sheet ? geometryFor(sheet) : null;
    if (editor.isDestroyed) return;
    const measure = () => {
      if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta('layout', true).setMeta('addToHistory', false));
    };
    measure();
    // A new typeface may still be loading: measure again once it has arrived.
    void document.fonts?.ready.then(measure);
  }, [editor, sheet, textMetrics]);

  useEffect(() => {
    onPageCount?.(pageCount);
  }, [onPageCount, pageCount]);

  return (
    <div className="flex flex-1 flex-col">
      {editable && <Toolbar editor={editor} />}
      {/* Keys are only observed here, for the typewriter sounds; the editor inside handles them. */}
      <div ref={frame} className="flex flex-1 flex-col" onKeyDownCapture={onKeyDownCapture} onKeyUpCapture={(event) => latest.current.typewriter.onKeyUp(event)}>
        <div
          data-layout={layout}
          className={sheet ? 'relative mx-auto mb-6' : 'relative flex flex-1 flex-col'}
          style={sheet ? { width: sheet.width, minHeight: pageCount * stride - PAGE_GAP } : undefined}
        >
          {sheet &&
            Array.from({ length: pageCount }, (_, index) => (
              <div
                key={index}
                aria-hidden
                data-testid="sheet"
                className="tn-sheet absolute inset-x-0 rounded-sm border border-line bg-surface shadow-soft"
                style={{ top: index * stride, height: sheet.height, ['--tn-sheet-margin' as string]: `${sheet.margin - 1}px` }}
              />
            ))}
          <EditorContent editor={editor} className="tn-editor relative flex flex-1 flex-col" style={sheet ? { padding: `${sheet.margin}px ${sheet.margin}px 0` } : undefined} />
        </div>
      </div>
      {slash && editable && <SlashMenu key={slash.items.map((item) => item.id).join()} editor={editor} state={slash} keysRef={slashKeys} />}
    </div>
  );
}
