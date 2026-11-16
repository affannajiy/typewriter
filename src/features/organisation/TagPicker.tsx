import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { MAX_TAG_LENGTH, createTag } from '@/database/repositories/tags';
import { t } from '@/i18n/en';
import type { Id, Tag } from '@/types/models';
import { useGuarded } from './useItemActions';

/** Shows an item's tags and lets the user add an existing or new tag, or remove one. */
export function TagPicker({ tags, selected, onChange }: { tags: Tag[]; selected: Id[]; onChange: (tagIds: Id[]) => void }) {
  const guarded = useGuarded();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const chosen = selected.map((id) => tags.find((tag) => tag.id === id)).filter((tag): tag is Tag => tag !== undefined);
  const listId = 'tag-suggestions';

  const add = () =>
    void guarded(async () => {
      if (name.trim() === '') return;
      // An existing name (ignoring case) returns the existing tag.
      const tag = await createTag(name);
      if (!selected.includes(tag.id)) onChange([...selected, tag.id]);
      setName('');
      setAdding(false);
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="sr-only">{t.tags.title}</span>
      {chosen.map((tag) => (
        <span key={tag.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 ps-2.5 pe-0.5 text-xs text-ink">
          <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: tag.colour }} />
          {tag.name}
          <button type="button" aria-label={t.tags.remove(tag.name)} title={t.tags.remove(tag.name)} onClick={() => onChange(selected.filter((id) => id !== tag.id))} className="grid size-6 place-items-center rounded-full hover:bg-accent-soft">
            <X size={12} aria-hidden />
          </button>
        </span>
      ))}
      {adding ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
          className="flex items-center gap-1"
        >
          <label className="sr-only" htmlFor="new-tag">
            {t.tags.tagName}
          </label>
          <input
            id="new-tag"
            autoFocus
            list={listId}
            value={name}
            maxLength={MAX_TAG_LENGTH}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setAdding(false);
            }}
            className="min-h-8 w-36 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink"
          />
          <datalist id={listId}>
            {tags.filter((tag) => !selected.includes(tag.id)).map((tag) => <option key={tag.id} value={tag.name} />)}
          </datalist>
          <Button type="submit" variant="primary" className="min-h-8! px-3! text-xs">
            {t.common.add}
          </Button>
          <Button variant="ghost" className="min-h-8! px-3! text-xs" onClick={() => setAdding(false)}>
            {t.common.cancel}
          </Button>
        </form>
      ) : (
        <Button variant="ghost" icon={Plus} className="min-h-8! px-2! text-xs text-muted" onClick={() => setAdding(true)}>
          {t.tags.add}
        </Button>
      )}
    </div>
  );
}
