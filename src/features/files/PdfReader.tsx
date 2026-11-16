import { ArrowLeft, Download, Highlighter, MoveHorizontal, NotebookText, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { type FormEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, IconButton, cx } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Layout';
import { useToast } from '@/components/ui/Toast';
import { addAnnotation, deleteAnnotation, noteAttachmentFacts, restoreAnnotation, updateAnnotation } from '@/database/repositories/attachments';
import { useGuarded } from '@/features/organisation/useItemActions';
import { useAnnotations, useAttachmentBytes } from '@/hooks/useData';
import { t } from '@/i18n/en';
import { type SaveStatus, createAutosaver } from '@/services/autosave';
import { type PdfDocument, type PdfPageSize, openPdf } from '@/services/pdf';
import { HIGHLIGHT_COLOURS, type Annotation, type Attachment, type HighlightColour, type Id } from '@/types/models';
import { downloadAttachment } from './fileActions';
import { type Box, cleanQuote, fromPageRects, hitsRects, toPageRects } from './highlights';

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const STEP = 1.25;
/** Space kept beside the page when it fits the width. */
const FIT_MARGIN = 16;

type Zoom = 'fit' | number;

/** A selection, split by page, waiting for a colour. */
interface PendingHighlight {
  page: number;
  rects: number[];
  quote: string;
}

const boxOf = (rect: DOMRect): Box => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });

/** The part of a selection that falls on one page's text, with its text and rectangles. */
function selectionOnPage(range: Range, pageElement: HTMLElement): PendingHighlight | null {
  const layer = pageElement.querySelector('.textLayer');
  const page = Number(pageElement.dataset.page);
  if (!layer || !range.intersectsNode(layer) || !Number.isInteger(page)) return null;
  const part = document.createRange();
  part.selectNodeContents(layer);
  if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0) part.setStart(range.startContainer, range.startOffset);
  if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) part.setEnd(range.endContainer, range.endOffset);
  const quote = cleanQuote(part.toString());
  const rects = toPageRects([...part.getClientRects()].map(boxOf), boxOf(pageElement.getBoundingClientRect()));
  return quote && rects.length > 0 ? { page, rects, quote } : null;
}

interface PageProps {
  doc: PdfDocument;
  number: number;
  size: PdfPageSize;
  scale: number;
  highlights: Annotation[];
  activeId: Id | null;
  onHighlightClick: (id: Id) => void;
}

/**
 * One page. It is painted only while near the screen, and its canvas is
 * released when it scrolls far away, so a long PDF does not fill the memory.
 */
function PdfPage({ doc, number, size, scale, highlights, activeId, onHighlightClick }: PageProps) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const element = frame.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setNear(entry?.isIntersecting ?? false), { rootMargin: '150% 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const paper = canvas.current;
    const layer = text.current;
    if (!near || !paper || !layer) return;
    const painting = doc.renderPage(number, paper, scale);
    const lettering = doc.renderText(number, layer, scale);
    painting.done.catch((error: unknown) => console.error(error));
    lettering.done.catch((error: unknown) => console.error(error));
    return () => {
      painting.cancel();
      lettering.cancel();
      // Give the pixels back at once instead of waiting for the collector.
      paper.width = 0;
      paper.height = 0;
    };
  }, [doc, near, number, scale]);

  const click = (event: MouseEvent<HTMLDivElement>) => {
    if (!document.getSelection()?.isCollapsed) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    const hit = [...highlights].reverse().find((item) => hitsRects(item.rects, x, y));
    if (hit) onHighlightClick(hit.id);
  };

  return (
    // A click inside a highlight opens its note; the notes list is the keyboard path to the same place.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <section
      ref={frame}
      data-page={number}
      aria-label={t.reader.pageRegion(number)}
      className="tn-pdf-page"
      style={{ width: size.width * scale, height: size.height * scale, ['--scale-factor' as string]: scale }}
      onClick={click}
    >
      {near && <canvas ref={canvas} aria-hidden />}
      <div className="tn-highlights" aria-hidden>
        {highlights.flatMap((item) =>
          fromPageRects(item.rects).map((r, index) => (
            <div
              key={`${item.id}-${index}`}
              className="tn-highlight"
              data-colour={item.colour}
              data-annotation={item.id}
              data-active={item.id === activeId ? '' : undefined}
              style={{ left: `${r.left * 100}%`, top: `${r.top * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` }}
            />
          )),
        )}
      </div>
      {near && <div ref={text} className="textLayer" />}
    </section>
  );
}

function NoteItem({ annotation, active, onGo, onDelete }: { annotation: Annotation; active: boolean; onGo: () => void; onDelete: () => void }) {
  const [note, setNote] = useState(annotation.note);
  const [status, setStatus] = useState<SaveStatus | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const guarded = useGuarded();
  const saver = useMemo(() => createAutosaver<string>((value) => updateAnnotation(annotation.id, { note: value }), setStatus), [annotation.id]);
  useEffect(() => () => saver.dispose(), [saver]);

  useEffect(() => {
    if (active) field.current?.focus({ preventScroll: false });
  }, [active]);

  return (
    <li data-annotation-item={annotation.id} className={cx('grid gap-2 rounded-lg border bg-surface p-3', active ? 'border-accent' : 'border-line')}>
      <div className="flex items-start gap-2">
        <span aria-hidden className="tn-swatch mt-1 size-3 shrink-0 rounded-full" data-colour={annotation.colour} />
        <blockquote className="line-clamp-4 min-w-0 flex-1 font-serif text-sm text-ink">{annotation.quote}</blockquote>
      </div>
      <label className="sr-only" htmlFor={`note-${annotation.id}`}>
        {t.reader.noteLabel(annotation.page)}
      </label>
      <textarea
        ref={field}
        id={`note-${annotation.id}`}
        value={note}
        rows={2}
        placeholder={t.reader.notePlaceholder}
        onChange={(event) => {
          setNote(event.target.value);
          saver.schedule(event.target.value);
        }}
        onBlur={() => void saver.flush()}
        className="min-h-16 w-full rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-ink placeholder:text-muted"
      />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Button variant="ghost" onClick={onGo} aria-label={t.reader.goTo(annotation.page)}>
          {t.reader.pageRegion(annotation.page)}
        </Button>
        <label className="flex items-center gap-1">
          <span>{t.reader.colourOf}</span>
          <select
            value={annotation.colour}
            onChange={(event) => void guarded(() => updateAnnotation(annotation.id, { colour: event.target.value as HighlightColour }))}
            className="rounded border border-line-strong bg-surface px-1 py-0.5 text-ink"
          >
            {HIGHLIGHT_COLOURS.map((colour) => (
              <option key={colour} value={colour}>
                {t.reader.colours[colour]}
              </option>
            ))}
          </select>
        </label>
        <span role="status" className="ms-auto">
          {status?.state === 'saved' ? t.reader.noteSaved : status?.state === 'saving' ? t.save.saving : ''}
        </span>
        <IconButton icon={Trash2} label={t.reader.deleteHighlight} onClick={onDelete} />
      </div>
    </li>
  );
}

/** Reads a stored PDF: pages, zoom, highlights and notes. */
export function PdfReader({ attachment }: { attachment: Attachment }) {
  const navigate = useNavigate();
  const toast = useToast();
  const guarded = useGuarded();
  const bytes = useAttachmentBytes(attachment.id);
  const annotations = useAnnotations(attachment.id);
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [sizes, setSizes] = useState<PdfPageSize[] | null>(null);
  const [openFailed, setOpenFailed] = useState(false);
  const failed = bytes === null || openFailed;
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [width, setWidth] = useState(0);
  const [current, setCurrent] = useState(1);
  const [pageText, setPageText] = useState('1');
  const [pending, setPending] = useState<PendingHighlight[] | null>(null);
  const [activeId, setActiveId] = useState<Id | null>(null);
  const [showNotes, setShowNotes] = useState(() => typeof window !== 'undefined' && (window.matchMedia?.('(min-width: 64rem)').matches ?? false));
  const pages = useRef<HTMLDivElement>(null);

  // Open the document once its bytes are here.
  useEffect(() => {
    if (!bytes) return;
    let alive = true;
    let opened: PdfDocument | null = null;
    void (async () => {
      try {
        opened = await openPdf(bytes);
        const all = await Promise.all(Array.from({ length: opened.pageCount }, (_, i) => opened!.pageSize(i + 1)));
        if (!alive) return;
        setDoc(opened);
        setSizes(all);
        if (attachment.pageCount !== opened.pageCount) void noteAttachmentFacts(attachment.id, { pageCount: opened.pageCount });
      } catch (error) {
        console.error(error);
        if (alive) setOpenFailed(true);
      }
    })();
    return () => {
      alive = false;
      opened?.destroy();
      setDoc(null);
    };
    // The page count is only recorded, not a reason to open the file again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bytes, attachment.id]);

  // The room for pages, for "fit to width".
  useEffect(() => {
    const element = pages.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [doc]);

  const widest = sizes ? Math.max(...sizes.map((size) => size.width)) : 0;
  const fitScale = widest > 0 && width > 0 ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, (width - FIT_MARGIN) / widest)) : 1;
  const scale = zoom === 'fit' ? fitScale : zoom;
  const pageCount = sizes?.length ?? attachment.pageCount ?? 0;

  // The page at the top of the screen is the current page.
  useEffect(() => {
    if (!sizes) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = (document.querySelector('.tn-reader-bar')?.getBoundingClientRect().bottom ?? 0) + 8;
      const elements = pages.current?.querySelectorAll<HTMLElement>('[data-page]') ?? [];
      for (const element of elements) {
        const box = element.getBoundingClientRect();
        if (box.bottom > top + box.height * 0.25 || element === elements[elements.length - 1]) {
          const number = Number(element.dataset.page);
          setCurrent(number);
          setPageText(String(number));
          return;
        }
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [sizes, scale]);

  // Remember the newest selection inside the pages, page by page, until a colour is chosen.
  useEffect(() => {
    const onSelection = () => {
      const selection = document.getSelection();
      const root = pages.current;
      if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !root) return;
      const range = selection.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) return;
      const parts = [...root.querySelectorAll<HTMLElement>('[data-page]')].flatMap((element) => selectionOnPage(range, element) ?? []);
      setPending(parts.length > 0 ? parts : null);
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, []);

  const goTo = useCallback((page: number) => {
    const element = pages.current?.querySelector<HTMLElement>(`[data-page="${page}"]`);
    element?.scrollIntoView({ block: 'start' });
  }, []);

  const submitPage = (event: FormEvent) => {
    event.preventDefault();
    const page = Math.round(Number(pageText));
    if (Number.isFinite(page) && page >= 1 && page <= pageCount) goTo(page);
    else setPageText(String(current));
  };

  const zoomBy = (factor: number) => setZoom(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(scale * factor * 100) / 100)));

  const highlight = (colour: HighlightColour) => {
    const parts = pending;
    if (!parts) {
      toast({ message: t.reader.highlightFailed });
      return;
    }
    void guarded(async () => {
      let last: Annotation | null = null;
      for (const part of parts) last = await addAnnotation({ attachmentId: attachment.id, page: part.page, colour, rects: part.rects, quote: part.quote });
      document.getSelection()?.removeAllRanges();
      setPending(null);
      if (last) setActiveId(last.id);
      toast({ message: t.reader.highlighted });
    });
  };

  const remove = (annotation: Annotation) =>
    void guarded(async () => {
      const removed = await deleteAnnotation(annotation.id);
      if (activeId === annotation.id) setActiveId(null);
      toast({ message: t.reader.highlightDeleted, action: { label: t.common.undo, run: () => void guarded(() => restoreAnnotation(removed)) } });
    });

  const openNote = (id: Id) => {
    setShowNotes(true);
    setActiveId(id);
  };

  const back = () => {
    // A reader opened from a link has no page to go back to inside the app.
    if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0) navigate(-1);
    else navigate('/files');
  };

  const byPage = useMemo(() => {
    const map = new Map<number, Annotation[]>();
    for (const item of annotations ?? []) map.set(item.page, [...(map.get(item.page) ?? []), item]);
    return map;
  }, [annotations]);

  return (
    <div className="flex flex-col gap-4">
      <div className="tn-reader-bar sticky z-10 -mx-2 flex flex-wrap items-center gap-2 border-b border-line bg-bg/95 px-2 py-2 backdrop-blur">
        <IconButton icon={ArrowLeft} label={t.reader.back} onClick={back} />
        <h1 className="min-w-48 flex-1 truncate font-display text-xl text-ink">{attachment.name}</h1>
        {pageCount > 0 && (
          <form onSubmit={submitPage} className="flex items-center gap-1 text-sm text-muted">
            <label htmlFor="reader-page" className="sr-only">
              {t.reader.pageInput(pageCount)}
            </label>
            <input
              id="reader-page"
              inputMode="numeric"
              value={pageText}
              onChange={(event) => setPageText(event.target.value)}
              onBlur={submitPage}
              className="w-12 rounded-md border border-line-strong bg-surface px-1 py-1 text-center text-ink"
            />
            <span aria-hidden>/ {pageCount}</span>
            <span className="sr-only" role="status">
              {t.reader.pageOf(current, pageCount)}
            </span>
          </form>
        )}
        <div className="flex items-center">
          <IconButton icon={ZoomOut} label={t.reader.zoomOut} onClick={() => zoomBy(1 / STEP)} disabled={scale <= MIN_SCALE} />
          <span className="w-14 text-center text-sm text-muted">{t.reader.zoom(Math.round(scale * 100))}</span>
          <IconButton icon={ZoomIn} label={t.reader.zoomIn} onClick={() => zoomBy(STEP)} disabled={scale >= MAX_SCALE} />
          <IconButton icon={MoveHorizontal} label={t.reader.fitWidth} pressed={zoom === 'fit'} onClick={() => setZoom('fit')} />
        </div>
        <div role="group" aria-label={t.reader.highlight} className="flex items-center gap-1">
          <Highlighter size={18} aria-hidden className="text-muted" />
          {HIGHLIGHT_COLOURS.map((colour) => (
            <button
              key={colour}
              type="button"
              data-colour={colour}
              aria-label={t.reader.highlightIn(t.reader.colours[colour])}
              title={t.reader.highlightIn(t.reader.colours[colour])}
              disabled={!pending}
              // Keep the selection: pressing the button must not move focus out of the text first.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => highlight(colour)}
              className="tn-swatch size-7 rounded-full border-2 border-surface shadow-[0_0_0_1px_var(--tn-border-strong)] disabled:opacity-40 pointer-coarse:size-9"
            />
          ))}
        </div>
        <IconButton icon={NotebookText} label={showNotes ? t.reader.hideNotes : t.reader.showNotes} pressed={showNotes} onClick={() => setShowNotes((open) => !open)} />
        <IconButton icon={Download} label={t.reader.download} onClick={() => void guarded(() => downloadAttachment(attachment))} />
      </div>

      <div className="flex flex-col-reverse gap-4 lg:flex-row lg:items-start">
        <div ref={pages} className="flex min-w-0 flex-1 flex-col gap-4">
          {failed ? (
            <p role="alert" className="rounded-lg border border-line-strong bg-sunken px-4 py-3 text-sm text-ink">
              {t.reader.failed}
            </p>
          ) : !doc || !sizes ? (
            <LoadingBlock />
          ) : (
            sizes.map((size, index) => (
              <PdfPage
                key={index}
                doc={doc}
                number={index + 1}
                size={size}
                scale={scale}
                highlights={byPage.get(index + 1) ?? []}
                activeId={activeId}
                onHighlightClick={openNote}
              />
            ))
          )}
        </div>
        {showNotes && (
          <aside aria-label={t.reader.notes} className="tn-reader-notes flex w-full shrink-0 flex-col gap-3 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:w-80 lg:overflow-y-auto">
            <h2 className="font-display text-lg text-ink">
              {t.reader.notes} <span className="text-sm text-muted">· {t.reader.count(annotations?.length ?? 0)}</span>
            </h2>
            <p className="text-sm text-muted">{t.reader.selectHint}</p>
            {annotations && annotations.length === 0 ? (
              <p className="text-sm text-muted">{t.reader.noNotes}</p>
            ) : (
              <ul className="grid gap-2">
                {(annotations ?? []).map((item) => (
                  <NoteItem key={item.id} annotation={item} active={item.id === activeId} onGo={() => goTo(item.page)} onDelete={() => remove(item)} />
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
