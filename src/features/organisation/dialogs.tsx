import { BookOpen, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, cx } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { MAX_NAME_LENGTH, byOrder } from '@/database/repositories/common';
import { DEFAULT_COVER_COLOUR, MAX_DESCRIPTION_LENGTH, type NotebookDetails } from '@/database/repositories/notebooks';
import type { Workspace } from '@/hooks/useData';
import { t } from '@/i18n/en';
import { COVER_KINDS, type CoverKind, NOTEBOOK_ICONS, type Notebook, type NotebookIcon, type PageLocation } from '@/types/models';
import { isHexColour } from '@/utils/colour';
import { NOTEBOOK_ICON_GLYPHS } from './covers';

/** A dialog with one name field. Used to create and to rename. */
export function NameDialog({ open, onClose, title, label, initial = '', submitLabel, maxLength = MAX_NAME_LENGTH, onSubmit }: {
  open: boolean;
  onClose: () => void;
  title: string;
  label: string;
  initial?: string;
  submitLabel: string;
  maxLength?: number;
  onSubmit: (name: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {/* Remounts with the dialog, so the field always starts from `initial`. */}
      <NameForm label={label} initial={initial} submitLabel={submitLabel} maxLength={maxLength} onClose={onClose} onSubmit={onSubmit} />
    </Dialog>
  );
}

function NameForm({ label, initial, submitLabel, maxLength, onClose, onSubmit }: {
  label: string;
  initial: string;
  submitLabel: string;
  maxLength: number;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim() === '') return setError(t.organise.nameRequired);
        onSubmit(name);
        onClose();
      }}
      className="flex flex-col gap-4"
    >
      <TextField label={label} value={name} maxLength={maxLength} error={error} data-autofocus autoComplete="off" onChange={(e) => setName(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t.common.cancel}</Button>
        <Button type="submit" variant="primary">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export const COVER_COLOURS = [
  { value: '#795b43', name: 'Walnut' },
  { value: '#263b32', name: 'Forest green' },
  { value: '#b08a50', name: 'Antique brass' },
  { value: '#7a2e2e', name: 'Oxblood' },
  { value: '#2f3e5c', name: 'Midnight blue' },
  { value: '#a7b2a0', name: 'Sage' },
  { value: '#8a5567', name: 'Mauve' },
  { value: '#292824', name: 'Ink' },
] as const;

/** A choice drawn as a small button; the selection shows by its border and weight, not colour alone. */
const choiceClass =
  'flex min-h-11 items-center gap-2 rounded-md border border-line px-3 text-sm text-ink hover:bg-accent-soft has-checked:border-ink has-checked:bg-accent-soft has-checked:font-semibold has-checked:shadow-[inset_0_0_0_1px_var(--tn-text)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus';

/** Create or edit a notebook: name, description, cover colour and finish, icon. */
export function NotebookDialog({ open, onClose, notebook, onSubmit }: {
  open: boolean;
  onClose: () => void;
  /** The notebook being edited, or undefined to create one. */
  notebook?: Notebook;
  onSubmit: (details: NotebookDetails) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={notebook ? t.notebook.editTitle : t.notebook.newTitle}>
      <NotebookForm notebook={notebook} onClose={onClose} onSubmit={onSubmit} />
    </Dialog>
  );
}

function NotebookForm({ notebook, onClose, onSubmit }: { notebook?: Notebook; onClose: () => void; onSubmit: (details: NotebookDetails) => void }) {
  const [name, setName] = useState(notebook?.name ?? '');
  const [description, setDescription] = useState(notebook?.description ?? '');
  const [colour, setColour] = useState(notebook?.cover.colour ?? DEFAULT_COVER_COLOUR);
  const [kind, setKind] = useState<CoverKind>(notebook?.cover.kind ?? 'solid');
  const [icon, setIcon] = useState<NotebookIcon | null>(notebook?.icon ?? null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim() === '') return setError(t.organise.nameRequired);
        onSubmit({ name, description, coverColour: isHexColour(colour) ? colour : DEFAULT_COVER_COLOUR, coverKind: kind, icon });
        onClose();
      }}
      className="flex flex-col gap-4"
    >
      <TextField label={t.notebook.name} value={name} maxLength={MAX_NAME_LENGTH} error={error} data-autofocus autoComplete="off" onChange={(e) => setName(e.target.value)} />
      <TextAreaField label={t.notebook.description} hint={t.common.optional} value={description} rows={2} maxLength={MAX_DESCRIPTION_LENGTH} onChange={(e) => setDescription(e.target.value)} />
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">{t.notebook.coverColour}</legend>
        <div className="flex flex-wrap items-center gap-2">
          {COVER_COLOURS.map((option) => (
            <label key={option.value} data-clickable title={option.name} className="relative block size-9 rounded-full has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus">
              <input type="radio" name="cover-colour" value={option.value} checked={colour === option.value} onChange={() => setColour(option.value)} className="peer sr-only" />
              <span className="sr-only">{option.name}</span>
              {/* The ring marks the selection by shape, not by colour alone. */}
              <span aria-hidden className="block size-9 rounded-full border border-line-strong peer-checked:ring-2 peer-checked:ring-ink peer-checked:ring-offset-2 peer-checked:ring-offset-surface" style={{ backgroundColor: option.value }} />
            </label>
          ))}
          <label className="ms-2 flex items-center gap-2 text-sm text-muted">
            {t.notebook.customColour}
            <input type="color" value={colour} onChange={(e) => setColour(e.target.value)} className="size-9 rounded border border-line-strong bg-surface p-0.5" />
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">{t.notebook.coverFinish}</legend>
        <div className="flex flex-wrap gap-2">
          {COVER_KINDS.map((value) => (
            <label key={value} data-clickable className={choiceClass}>
              <input type="radio" name="cover-finish" value={value} checked={kind === value} onChange={() => setKind(value)} className="sr-only" />
              <span aria-hidden data-kind={value} className="tn-cover block h-7 w-5 shrink-0 rounded-sm border border-black/20" style={{ backgroundColor: isHexColour(colour) ? colour : DEFAULT_COVER_COLOUR }} />
              {t.notebook.finishes[value]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">{t.notebook.icon}</legend>
        <div className="flex flex-wrap gap-2">
          <label data-clickable className={choiceClass}>
            <input type="radio" name="notebook-icon" value="" checked={icon === null} onChange={() => setIcon(null)} className="sr-only" />
            {t.notebook.noIcon}
          </label>
          {NOTEBOOK_ICONS.map((value) => {
            const Glyph = NOTEBOOK_ICON_GLYPHS[value];
            return (
              <label key={value} data-clickable title={t.notebook.icons[value]} className={cx(choiceClass, 'w-11 justify-center px-0')}>
                <input type="radio" name="notebook-icon" value={value} checked={icon === value} onChange={() => setIcon(value)} className="sr-only" />
                <Glyph aria-hidden size={18} />
                <span className="sr-only">{t.notebook.icons[value]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t.common.cancel}</Button>
        <Button type="submit" variant="primary">
          {notebook ? t.common.save : t.notebook.create}
        </Button>
      </div>
    </form>
  );
}

/** A destination in the Move dialog: a notebook, or the loose pages. */
type Destination = { key: string; label: string; kind: 'loose' | 'notebook'; location: PageLocation };

/** The places a page may move to: out of every notebook, or into one. */
export function listDestinations(workspace: Workspace): Destination[] {
  return [
    { key: 'loose', label: t.organise.topLevel, kind: 'loose', location: { notebookId: null } },
    ...[...workspace.notebooks].sort(byOrder).map((n): Destination => ({ key: `n:${n.id}`, label: n.name, kind: 'notebook', location: { notebookId: n.id } })),
  ];
}

const destinationIcons = { loose: FileText, notebook: BookOpen };

/** Choose a new location. This moves the item; it does not create a reference. */
export function MoveDialog({ open, onClose, workspace, itemName, current, onMove }: {
  open: boolean;
  onClose: () => void;
  workspace: Workspace;
  itemName: string;
  current: PageLocation;
  onMove: (location: PageLocation) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={t.organise.moveTitle(itemName)}>
      <MoveForm workspace={workspace} current={current} onClose={onClose} onMove={onMove} />
    </Dialog>
  );
}

function MoveForm({ workspace, current, onClose, onMove }: {
  workspace: Workspace;
  current: PageLocation;
  onClose: () => void;
  onMove: (location: PageLocation) => void;
}) {
  const destinations = useMemo(() => listDestinations(workspace), [workspace]);
  const currentKey = current.notebookId ? `n:${current.notebookId}` : 'loose';
  const [selected, setSelected] = useState(currentKey);
  const target = destinations.find((d) => d.key === selected);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (target && selected !== currentKey) onMove(target.location);
        onClose();
      }}
      className="flex flex-col gap-4"
    >
      <fieldset>
        <legend className="mb-2 text-sm text-muted">{t.organise.moveHint}</legend>
        <div className="max-h-72 overflow-y-auto rounded-md border border-line p-1">
          {destinations.map((destination) => {
            const Icon = destinationIcons[destination.kind];
            return (
              <label
                key={destination.key}
                data-clickable
                className={cx('flex min-h-10 items-center gap-2 rounded px-2 text-sm text-ink hover:bg-accent-soft has-checked:bg-accent-soft has-checked:font-semibold pointer-coarse:min-h-11')}
              >
                <input type="radio" name="destination" value={destination.key} checked={selected === destination.key} onChange={() => setSelected(destination.key)} className="accent-(--tn-accent)" />
                <Icon size={16} aria-hidden className="shrink-0 text-muted" />
                <span className="truncate">{destination.label}</span>
                {destination.key === currentKey && <span className="ms-auto text-xs font-normal text-muted">{t.organise.currentLocation}</span>}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t.common.cancel}</Button>
        <Button type="submit" variant="primary" disabled={selected === currentKey}>
          {t.organise.moveHere}
        </Button>
      </div>
    </form>
  );
}
