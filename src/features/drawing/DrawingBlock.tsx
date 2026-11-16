import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { Maximize2 } from 'lucide-react';
import { useEffect } from 'react';
import { Button, cx } from '@/components/ui/Button';
import { DEFAULT_DRAWING_HEIGHT, DRAWING_WIDTH, copyDrawing } from '@/database/repositories/drawings';
import { useDrawing } from '@/hooks/useData';
import { t } from '@/i18n/en';
import { DrawingView } from './DrawingView';
import { type DrawingNodeOptions, newDrawingId } from './drawingNode';

/** The drawing as it sits in the page: a preview and a button that opens it full screen. */
export function DrawingBlock({ node, editor, extension, selected, updateAttributes }: ReactNodeViewProps) {
  const drawingId = typeof node.attrs.drawingId === 'string' ? node.attrs.drawingId : null;
  const drawing = useDrawing(drawingId);
  const options = extension.options as DrawingNodeOptions;
  const editable = editor.isEditable;

  // A block pasted from another page points at that page's drawing. Give this page its own copy,
  // so deleting the other page never empties this block.
  useEffect(() => {
    const pageId = options.pageId;
    if (!editable || !drawing || !pageId || drawing.pageId === pageId) return;
    const copyId = newDrawingId();
    void copyDrawing(drawing.id, copyId, pageId).then(() => updateAttributes({ drawingId: copyId }));
  }, [drawing, editable, options.pageId, updateAttributes]);

  const strokes = drawing?.strokes ?? [];
  const height = drawing?.height ?? DEFAULT_DRAWING_HEIGHT;

  return (
    <NodeViewWrapper
      as="figure"
      data-drawing-id={drawingId ?? undefined}
      // Read by the ruled-paper styles, which round the preview up to whole lines.
      style={{ ['--tn-drawing-ratio' as string]: height / (drawing?.width ?? DRAWING_WIDTH) }}
      className={cx('tn-drawing my-3 overflow-hidden rounded-lg border bg-surface', selected ? 'border-accent outline-2 outline-offset-2 outline-focus' : 'border-line')}
    >
      {drawing === undefined ? (
        // Space held while the strokes load, so the text below does not jump.
        <div aria-hidden style={{ aspectRatio: `${DRAWING_WIDTH} / ${height}` }} />
      ) : strokes.length > 0 ? (
        <DrawingView strokes={strokes} width={drawing?.width ?? DRAWING_WIDTH} height={height} label={t.drawing.preview(strokes.length)} />
      ) : (
        <p className="px-4 py-8 text-center text-sm text-muted">{t.drawing.empty}</p>
      )}
      {editable && drawingId && (
        <div className="flex justify-end border-t border-line bg-sunken/40 px-2 py-1">
          <Button variant="ghost" icon={Maximize2} onClick={() => options.onOpen(drawingId)}>
            {t.drawing.open}
          </Button>
        </div>
      )}
    </NodeViewWrapper>
  );
}
