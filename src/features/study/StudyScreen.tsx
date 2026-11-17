import { GraduationCap, Layers, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { EmptyState, LoadingBlock, PageHeader } from '@/components/ui/Layout';
import { Menu } from '@/components/ui/Menu';
import { useToast } from '@/components/ui/Toast';
import { deleteDeck } from '@/database/repositories/flashcards';
import { useGuarded } from '@/features/organisation/useItemActions';
import { useDecks } from '@/hooks/useData';
import { t } from '@/i18n/en';
import type { Deck } from '@/types/models';
import { DeckDialog } from './StudyDialogs';
import type { DeckCounts } from './queue';
import { deckPath, reviewPath, toStudy, useStudyCounts } from './studyData';

export function CountsLine({ counts }: { counts: DeckCounts | undefined }) {
  return (
    <p className="text-sm text-muted tabular-nums">
      {t.study.cards(counts?.total ?? 0)} · {t.study.counts(counts?.new ?? 0, counts?.learning ?? 0, counts?.review ?? 0)}
    </p>
  );
}

/** All decks: what each has to study now, and the way into each. */
export default function StudyScreen() {
  const decks = useDecks();
  const { counts, loaded } = useStudyCounts();
  const guarded = useGuarded();
  const toast = useToast();
  const [editing, setEditing] = useState<Deck | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Deck | null>(null);

  if (!decks || !loaded) return <LoadingBlock />;
  const total = decks.reduce((sum, deck) => sum + toStudy(counts.get(deck.id)), 0);

  const remove = (deck: Deck) =>
    void guarded(async () => {
      await deleteDeck(deck.id);
      setDeleting(null);
      toast({ message: t.study.deckDeleted(deck.name) });
    });

  return (
    <>
      <PageHeader
        title={t.study.title}
        description={t.study.description}
        actions={
          <>
            <Button icon={Plus} onClick={() => setEditing('new')}>
              {t.study.newDeck}
            </Button>
            {total > 0 && (
              <Link to={reviewPath('all')} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-on-accent hover:opacity-90 pointer-coarse:min-h-11">
                <Play size={16} aria-hidden />
                {t.study.studyAll}
              </Link>
            )}
          </>
        }
      />
      {decks.length === 0 ? (
        <EmptyState icon={GraduationCap} title={t.study.emptyTitle} body={t.study.emptyBody} action={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>{t.study.newDeck}</Button>} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {decks.map((deck) => {
            const deckCount = counts.get(deck.id);
            const due = toStudy(deckCount);
            return (
              <li key={deck.id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
                <div className="flex items-start gap-3">
                  <Layers size={22} aria-hidden className="mt-0.5 shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <Link to={deckPath(deck.id)} className="block truncate text-lg font-semibold text-ink hover:underline">
                      {deck.name}
                    </Link>
                    {deck.description && <p className="line-clamp-2 text-sm text-muted">{deck.description}</p>}
                    <CountsLine counts={deckCount} />
                  </div>
                  <Menu
                    label={t.study.deckActions(deck.name)}
                    items={[
                      { id: 'edit', label: t.study.editDeck, icon: Pencil, onSelect: () => setEditing(deck) },
                      { id: 'delete', label: t.study.deleteDeck, icon: Trash2, danger: true, onSelect: () => setDeleting(deck) },
                    ]}
                  />
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  {due > 0 ? (
                    <Link to={reviewPath(deck.id)} aria-label={t.study.studyDeck(deck.name)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-on-accent hover:opacity-90 pointer-coarse:min-h-11">
                      <Play size={16} aria-hidden />
                      {t.study.study}
                    </Link>
                  ) : (
                    <p className="text-sm text-muted">{t.study.nothingDue}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {editing && <DeckDialog deck={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove(deleting)}
        title={deleting ? t.study.deleteDeckTitle(deleting.name) : ''}
        message={t.study.deleteDeckMessage(deleting ? (counts.get(deleting.id)?.total ?? 0) : 0)}
        confirmLabel={t.study.deleteDeck}
        cancelLabel={t.study.keepDeck}
      />
    </>
  );
}
