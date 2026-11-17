import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, cx } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { t } from '@/i18n/en';
import { MAX_LATEX_LENGTH, renderMath } from '@/services/math';
import { MathRender } from './MathRender';
import { MATH_EDIT_EVENT } from './mathNodes';

function MathDialog({ initial, display, onSave, onCancel, onRemove }: { initial: string; display: boolean; onSave: (latex: string) => void; onCancel: () => void; onRemove: () => void }) {
  const [latex, setLatex] = useState(initial);
  const fieldId = useId();
  const result = latex.trim() === '' ? null : renderMath(latex, true);
  return createPortal(
    <Dialog
      open
      onClose={onCancel}
      title={display ? t.math.editBlock : t.math.editInline}
      onSubmit={() => onSave(latex.trim())}
      footer={
        <>
          {initial !== '' && (
            <Button variant="ghost" className="me-auto" onClick={onRemove}>
              {t.math.remove}
            </Button>
          )}
          <Button onClick={onCancel}>{t.common.cancel}</Button>
          <Button variant="primary" type="submit">
            {t.common.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="text-sm font-medium text-ink">
          {t.math.sourceLabel}
        </label>
        <textarea
          id={fieldId}
          data-autofocus
          value={latex}
          maxLength={MAX_LATEX_LENGTH}
          rows={3}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-describedby={`${fieldId}-hint`}
          onChange={(event) => setLatex(event.target.value)}
          onKeyDown={(event) => {
            // Enter saves; Shift + Enter makes a new line in the source.
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onSave(latex.trim());
            }
          }}
          className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink"
        />
        <p id={`${fieldId}-hint`} className="text-xs text-muted">
          {t.math.hint}
        </p>
      </div>
      <p className="mt-4 mb-1 text-sm font-medium text-ink">{t.math.preview}</p>
      <div aria-live="polite" className="min-h-14 overflow-x-auto rounded-md border border-line bg-sunken/40 px-3 py-2 text-ink">
        {result === null ? <span className="text-sm text-muted">{t.math.previewEmpty}</span> : result.ok ? <MathRender latex={latex} display /> : <span className="text-sm text-danger">{t.math.invalid(result.error)}</span>}
      </div>
    </Dialog>,
    document.body,
  );
}

/** True once after an insert command asked the next equation view to open its editor. */
function takeOpenRequest(storage: unknown, name: string): boolean {
  const entry = (storage as Record<string, { openNext: boolean } | undefined>)[name];
  if (!entry?.openNext) return false;
  entry.openNext = false;
  return true;
}

/** An equation in the page. Click it, or select it and press Enter, to edit its source. */
export function MathView({ node, editor, extension, selected, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const display = node.type.name === 'mathBlock';
  const latex = typeof node.attrs.latex === 'string' ? node.attrs.latex : '';
  // A new, empty equation opens its editor at once; one stored empty does not.
  const [editing, setEditing] = useState(() => editor.isEditable && takeOpenRequest(editor.storage, extension.name));
  const wrapper = useRef<HTMLElement>(null);
  const editable = editor.isEditable;

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const open = () => editable && setEditing(true);
    element.addEventListener(MATH_EDIT_EVENT, open);
    return () => element.removeEventListener(MATH_EDIT_EVENT, open);
  }, [editable]);

  const close = () => {
    setEditing(false);
    editor.commands.focus();
  };
  const save = (value: string) => {
    if (value === '') deleteNode();
    else updateAttributes({ latex: value });
    close();
  };
  const cancel = () => {
    // An equation that was never written is not left behind empty.
    if (latex === '') deleteNode();
    close();
  };

  const label = latex === '' ? t.math.empty : t.math.label(latex);

  return (
    <NodeViewWrapper
      ref={wrapper}
      as={display ? 'div' : 'span'}
      data-type={display ? 'math-block' : 'math-inline'}
      contentEditable={false}
      className={cx(display ? 'tn-math-block my-3 flex justify-center overflow-x-auto px-2 py-1' : 'tn-math-inline', selected && 'rounded-sm outline-2 outline-offset-2 outline-focus')}
    >
      {editable ? (
        <button type="button" aria-label={label} title={t.math.editHint} onClick={() => setEditing(true)} className={cx('cursor-pointer rounded-sm text-inherit hover:bg-accent-soft', display ? 'max-w-full px-2' : 'px-0.5')}>
          <MathRender latex={latex} display={display} />
        </button>
      ) : (
        <span role="img" aria-label={label}>
          <MathRender latex={latex} display={display} />
        </span>
      )}
      {editing && <MathDialog initial={latex} display={display} onSave={save} onCancel={cancel} onRemove={() => save('')} />}
    </NodeViewWrapper>
  );
}
