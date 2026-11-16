import { ChevronsDown, Download, Eraser, Highlighter, Lasso, type LucideIcon, Pen, Redo2, Trash2, Undo2 } from 'lucide-react';
import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, type SyntheticEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, IconButton, cx } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Layout';
import { DEFAULT_DRAWING_HEIGHT, DRAWING_WIDTH, type DrawingDraft, clampHeight, saveDrawing } from '@/database/repositories/drawings';
import { SaveIndicator } from '@/features/pages/SaveIndicator';
import { useDrawing } from '@/hooks/useData';
import { t } from '@/i18n/en';
import { type Autosaver, type SaveStatus, createAutosaver } from '@/services/autosave';
import { downloadBlob } from '@/services/storage';
import { type Drawing, type DrawTool, INK_COLOURS, type Id, type InkColour, type Stroke } from '@/types/models';
import { StrokeLayer, StrokeShape } from './DrawingView';
import { drawingFileName, drawingToPng } from './exportPng';
import { type Box, type History, IDENTITY, MAX_SCALE, MIN_SCALE, type Point, type Transform, boundsOf, contentBottom, emptyHistory, eraseAt, inkFill, record, redo, selectInLasso, transformStrokes, undo } from './geometry';

export type Tool = DrawTool | 'eraser' | 'lasso';
export type SizeName = 'fine' | 'medium' | 'bold';

/** Line width in canvas units. A highlighter is three times wider than a pen. */
export const PEN_SIZES: Record<SizeName, number> = { fine: 3, medium: 6, bold: 12 };
const ERASER_RADIUS: Record<SizeName, number> = { fine: 8, medium: 16, bold: 32 };
const SPACE_STEP = 300;
/** On-screen size of the resize handle, in CSS pixels. */
const HANDLE_PX = 24;

const TOOL_ICONS: Record<Tool, LucideIcon> = { pen: Pen, highlighter: Highlighter, eraser: Eraser, lasso: Lasso };

type Gesture =
  | { kind: 'ink'; stroke: Stroke }
  | { kind: 'erase'; before: Stroke[]; current: Stroke[] }
  | { kind: 'lasso'; points: Point[] }
  | { kind: 'move' | 'scale'; start: Point; box: Box; transform: Transform | null };

const isMod = (event: KeyboardEvent) => event.ctrlKey || event.metaKey;

interface DrawingEditorProps {
  drawingId: Id;
  pageId: Id;
  onClose: () => void;
}

/** The full-screen drawing editor. Waits for the stored strokes, then opens. */
export function DrawingEditor(props: DrawingEditorProps) {
  const stored = useDrawing(props.drawingId);
  if (stored === undefined) return null;
  return <Workbench key={props.drawingId} stored={stored} {...props} />;
}

function Workbench({ stored, drawingId, pageId, onClose }: DrawingEditorProps & { stored: Drawing | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const titleId = useId();
  const hintId = useId();

  const [strokes, setStrokes] = useState<Stroke[]>(() => stored?.strokes ?? []);
  const [height, setHeight] = useState(() => stored?.height ?? DEFAULT_DRAWING_HEIGHT);
  const [history, setHistory] = useState<History>(emptyHistory);
  const [tool, setTool] = useState<Tool>('pen');
  const [colour, setColour] = useState<InkColour>('ink');
  const [size, setSize] = useState<SizeName>('medium');
  const [selection, setSelection] = useState<ReadonlySet<Id>>(() => new Set());
  const [live, setLive] = useState<Stroke | null>(null);
  const [lasso, setLasso] = useState<Point[] | null>(null);
  const [preview, setPreview] = useState<Transform | null>(null);
  const [penSeen, setPenSeen] = useState(false);
  // Canvas units per CSS pixel, so handles keep their size on any screen.
  const [unit, setUnit] = useState(1);
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState<SaveStatus>({ state: 'idle', savedAt: stored?.updatedAt ?? null, error: null });

  const gesture = useRef<Gesture | null>(null);
  const saver = useRef<Autosaver<DrawingDraft> | null>(null);
  // Pointer handlers run between renders; they read the newest values from here.
  const now = useRef({ strokes, height, selection, penSeen });
  useEffect(() => {
    now.current = { strokes, height, selection, penSeen };
  });

  useEffect(() => {
    const autosaver = createAutosaver<DrawingDraft>((draft) => saveDrawing(drawingId, pageId, draft), setStatus);
    saver.current = autosaver;
    return () => autosaver.dispose();
  }, [drawingId, pageId]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (typeof element.showModal === 'function' && !element.open) element.showModal();
    else element.setAttribute('open', '');
    return () => {
      if (element.open && typeof element.close === 'function') element.close();
    };
  }, []);

  useEffect(() => {
    const element = svg.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const width = element.getBoundingClientRect().width;
      if (width > 0) setUnit(DRAWING_WIDTH / width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const save = (next: { strokes?: Stroke[]; height?: number }) => {
    saver.current?.schedule({ strokes: next.strokes ?? now.current.strokes, height: next.height ?? now.current.height });
  };

  /** One undoable change. `before` defaults to the strokes on screen. */
  const commit = (next: Stroke[], before: Stroke[] = now.current.strokes) => {
    setHistory((h) => record(h, before));
    setStrokes(next);
    now.current.strokes = next;
    save({ strokes: next });
  };

  const step = (direction: 'undo' | 'redo') => {
    const result = (direction === 'undo' ? undo : redo)(history, strokes);
    if (!result) return;
    setHistory(result.history);
    setStrokes(result.strokes);
    setSelection(new Set());
    save({ strokes: result.strokes });
  };

  const deleteSelection = () => {
    if (selection.size === 0) return;
    commit(strokes.filter((stroke) => !selection.has(stroke.id)));
    setSelection(new Set());
  };

  const addSpace = () => {
    const next = clampHeight(height + SPACE_STEP);
    setHeight(next);
    now.current.height = next;
    save({ height: next });
  };

  const exportImage = async () => {
    try {
      downloadBlob(drawingFileName(), await drawingToPng(strokes, DRAWING_WIDTH, height));
      setNotice(t.drawing.exported);
    } catch (error) {
      console.error(error);
      setNotice(t.drawing.exportFailed);
    }
  };

  /** Writes what is left, then closes. A failed write keeps the editor open, with the error on screen. */
  const requestClose = async () => {
    const autosaver = saver.current;
    if (autosaver) {
      await autosaver.flush();
      if (autosaver.isDirty()) return;
    }
    onClose();
  };

  const onCancel = (event: SyntheticEvent) => {
    // Escape first drops a selection; the next Escape closes.
    event.preventDefault();
    if (selection.size > 0) setSelection(new Set());
    else void requestClose();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (isMod(event) && key === 'z') step(event.shiftKey ? 'redo' : 'undo');
    else if (isMod(event) && key === 'y') step('redo');
    else if ((event.key === 'Delete' || event.key === 'Backspace') && selection.size > 0) deleteSelection();
    else return;
    event.preventDefault();
  };

  // Pointer input ---------------------------------------------------------

  const toCanvas = (event: { clientX: number; clientY: number }): Point => {
    const rect = svg.current!.getBoundingClientRect();
    const scale = rect.width > 0 ? DRAWING_WIDTH / rect.width : 1;
    return { x: (event.clientX - rect.left) * scale, y: (event.clientY - rect.top) * scale };
  };

  const pressureOf = (event: PointerEvent) => (event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : 0.5);

  const selectionBox = useMemo(() => (selection.size > 0 ? boundsOf(strokes.filter((s) => selection.has(s.id))) : null), [selection, strokes]);

  const begin = (event: ReactPointerEvent<SVGSVGElement>, scaling = false) => {
    const native = event.nativeEvent;
    if (native.pointerType === 'pen' && !now.current.penSeen) setPenSeen(true);
    // Once a pen is used, a finger or palm scrolls instead of drawing.
    if (native.pointerType === 'touch' && now.current.penSeen) return;
    if (native.pointerType === 'mouse' && native.button !== 0) return;
    event.preventDefault();
    svg.current?.setPointerCapture?.(native.pointerId);
    const at = toCanvas(native);
    const current = now.current.strokes;

    if (scaling && selectionBox) {
      gesture.current = { kind: 'scale', start: at, box: selectionBox, transform: null };
      return;
    }
    if (tool === 'pen' || tool === 'highlighter') {
      setSelection(new Set());
      const stroke: Stroke = {
        id: crypto.randomUUID(),
        tool,
        colour,
        size: PEN_SIZES[size] * (tool === 'highlighter' ? 3 : 1),
        pen: native.pointerType === 'pen',
        points: [at.x, at.y, pressureOf(native)],
      };
      gesture.current = { kind: 'ink', stroke };
      setLive(stroke);
    } else if (tool === 'eraser') {
      const next = eraseAt(current, at, ERASER_RADIUS[size], () => crypto.randomUUID());
      gesture.current = { kind: 'erase', before: current, current: next };
      if (next !== current) setStrokes(next);
    } else if (selectionBox && at.x >= selectionBox.minX && at.x <= selectionBox.maxX && at.y >= selectionBox.minY && at.y <= selectionBox.maxY) {
      gesture.current = { kind: 'move', start: at, box: selectionBox, transform: null };
    } else {
      setSelection(new Set());
      gesture.current = { kind: 'lasso', points: [at] };
      setLasso([at]);
    }
  };

  const extend = (event: ReactPointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (!active) return;
    const native = event.nativeEvent;
    // Coalesced events carry every sample the pen reported since the last frame.
    const samples = native.getCoalescedEvents?.() ?? [];
    const events = samples.length > 0 ? samples : [native];

    if (active.kind === 'ink') {
      const points = active.stroke.points.slice();
      for (const sample of events) {
        const at = toCanvas(sample);
        points.push(at.x, at.y, pressureOf(sample));
      }
      active.stroke = { ...active.stroke, points };
      setLive(active.stroke);
    } else if (active.kind === 'erase') {
      let next = active.current;
      for (const sample of events) next = eraseAt(next, toCanvas(sample), ERASER_RADIUS[size], () => crypto.randomUUID());
      if (next !== active.current) {
        active.current = next;
        setStrokes(next);
      }
    } else if (active.kind === 'lasso') {
      active.points = [...active.points, ...events.map(toCanvas)];
      setLasso(active.points);
    } else {
      const at = toCanvas(native);
      if (active.kind === 'move') {
        active.transform = { ...IDENTITY, dx: at.x - active.start.x, dy: at.y - active.start.y };
      } else {
        // The opposite corner stays where it is.
        const origin = { x: active.box.minX, y: active.box.minY };
        const sx = (at.x - origin.x) / Math.max(1, active.start.x - origin.x);
        const sy = (at.y - origin.y) / Math.max(1, active.start.y - origin.y);
        active.transform = { dx: 0, dy: 0, origin, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.max(sx, sy))) };
      }
      setPreview(active.transform);
    }
  };

  const finish = (cancelled: boolean) => {
    const active = gesture.current;
    gesture.current = null;
    if (!active) return;
    if (active.kind === 'ink') {
      setLive(null);
      if (!cancelled) commit([...now.current.strokes, active.stroke]);
    } else if (active.kind === 'erase') {
      if (cancelled) setStrokes(active.before);
      else if (active.current !== active.before) commit(active.current, active.before);
    } else if (active.kind === 'lasso') {
      setLasso(null);
      if (!cancelled) setSelection(selectInLasso(now.current.strokes, active.points));
    } else {
      setPreview(null);
      if (!cancelled && active.transform) {
        const moved = transformStrokes(now.current.strokes, now.current.selection, active.transform);
        // Never let a moved drawing end below the canvas: grow it instead.
        const bottom = contentBottom(moved);
        if (bottom > now.current.height) {
          const next = clampHeight(bottom + 40);
          setHeight(next);
          now.current.height = next;
        }
        commit(moved);
      }
    }
  };

  const shown = useMemo(() => (preview ? transformStrokes(strokes, selection, preview) : strokes), [preview, strokes, selection]);
  const shownBox = useMemo(() => (selection.size > 0 ? boundsOf(shown.filter((s) => selection.has(s.id))) : null), [selection, shown]);
  const handle = HANDLE_PX * unit;

  const hint = selection.size > 0 ? t.drawing.selected(selection.size) : penSeen ? t.drawing.penMode : t.drawing.keyboardHint;

  return (
    // The keyboard shortcuts are a convenience; every action also has a button.
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={onCancel}
      onKeyDown={onKeyDown}
      className="m-0 h-dvh max-h-none w-screen max-w-none flex-col bg-bg p-0 text-ink open:flex backdrop:bg-black/45"
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2">
        <h2 id={titleId} className="text-lg font-semibold">
          {t.drawing.title}
        </h2>
        <div className="min-w-0 flex-1 text-xs text-muted">{(stored || status.state !== 'idle') && <SaveIndicator status={status} onRetry={() => void saver.current?.flush()} />}</div>
        <Button variant="primary" onClick={() => void requestClose()}>
          {t.drawing.done}
        </Button>
      </header>

      <div role="toolbar" aria-label={t.drawing.tools} className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <Segmented<Tool>
          legend={t.drawing.tool}
          name="drawing-tool"
          value={tool}
          iconsOnly
          options={(['pen', 'highlighter', 'eraser', 'lasso'] as const).map((value) => ({ value, label: t.drawing.toolNames[value], icon: TOOL_ICONS[value] }))}
          onChange={(value) => {
            setTool(value);
            if (value !== 'lasso') setSelection(new Set());
          }}
        />
        <fieldset className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-surface p-0.5">
          <legend className="sr-only">{t.drawing.colour}</legend>
          {INK_COLOURS.map((value) => (
            <label
              key={value}
              title={t.drawing.colourNames[value]}
              className="flex size-9 items-center justify-center rounded has-checked:bg-accent-soft has-checked:shadow-[inset_0_0_0_2px_var(--tn-accent)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus pointer-coarse:size-10"
            >
              <input type="radio" name="drawing-colour" value={value} checked={colour === value} onChange={() => setColour(value)} className="sr-only" />
              <span aria-hidden className="size-5 rounded-full border border-line-strong" style={{ background: inkFill(value) }} />
              <span className="sr-only">{t.drawing.colourNames[value]}</span>
            </label>
          ))}
        </fieldset>
        <Segmented<SizeName>
          legend={t.drawing.size}
          name="drawing-size"
          value={size}
          options={(['fine', 'medium', 'bold'] as const).map((value) => ({ value, label: t.drawing.sizeNames[value] }))}
          onChange={setSize}
        />
        <div className="flex items-center">
          <IconButton icon={Undo2} label={t.drawing.undo} disabled={history.past.length === 0} onClick={() => step('undo')} />
          <IconButton icon={Redo2} label={t.drawing.redo} disabled={history.future.length === 0} onClick={() => step('redo')} />
          <IconButton icon={Trash2} label={t.drawing.deleteSelection} disabled={selection.size === 0} onClick={deleteSelection} />
          <IconButton icon={ChevronsDown} label={t.drawing.addSpace} onClick={addSpace} />
          <IconButton icon={Download} label={t.drawing.exportPng} onClick={() => void exportImage()} />
        </div>
      </div>

      <p id={hintId} role="status" aria-live="polite" className="px-4 pt-2 text-xs text-muted">
        {notice || hint}
      </p>

      <div className="flex-1 overflow-auto px-2 py-3 sm:px-4">
        <svg
          ref={svg}
          role="img"
          aria-label={t.drawing.canvas(strokes.length)}
          aria-describedby={hintId}
          data-testid="drawing-canvas"
          viewBox={`0 0 ${DRAWING_WIDTH} ${height}`}
          className={cx('mx-auto block h-auto w-full max-w-[1000px] rounded-md border border-line bg-surface shadow-soft', tool === 'lasso' ? 'cursor-crosshair' : 'cursor-default')}
          // With a pen in use, a finger scrolls the page; otherwise every touch draws.
          style={{ touchAction: penSeen ? 'pan-x pan-y' : 'none' }}
          onPointerDown={(event) => begin(event)}
          onPointerMove={extend}
          onPointerUp={() => finish(false)}
          onPointerCancel={() => finish(true)}
        >
          <StrokeLayer strokes={shown} />
          {live && <StrokeShape stroke={live} last={false} />}
          {lasso && lasso.length > 1 && <polyline points={lasso.map((p) => `${p.x},${p.y}`).join(' ')} fill="var(--tn-accent-soft)" fillOpacity={0.5} stroke="var(--tn-accent)" strokeWidth={unit * 1.5} strokeDasharray={`${unit * 6} ${unit * 4}`} />}
          {shownBox && (
            <g>
              <rect
                x={shownBox.minX}
                y={shownBox.minY}
                width={shownBox.maxX - shownBox.minX}
                height={shownBox.maxY - shownBox.minY}
                fill="none"
                stroke="var(--tn-accent)"
                strokeWidth={unit * 1.5}
                strokeDasharray={`${unit * 6} ${unit * 4}`}
                data-testid="selection-box"
              />
              <rect
                aria-label={t.drawing.resize}
                x={shownBox.maxX - handle / 2}
                y={shownBox.maxY - handle / 2}
                width={handle}
                height={handle}
                rx={unit * 4}
                fill="var(--tn-accent)"
                className="cursor-nwse-resize"
                data-testid="resize-handle"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  begin(event as unknown as ReactPointerEvent<SVGSVGElement>, true);
                }}
              />
            </g>
          )}
        </svg>
      </div>
    </dialog>
  );
}
