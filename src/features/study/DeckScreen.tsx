import { Layers, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Breadcrumbs, EmptyState, LoadingBlock, PageHeader } from '@/components/ui/Layout';
import { Menu } from '@/components/ui/Menu';
import { useToast } from '@/components/ui/Toast';
import { deleteCard, restoreCard } from '@/database/repositories/flashcards';
import { pagePath } from '@/features/organisation/items';
import { useGuarded } from '@/features/organisation/useItemActions';
import { NotFound } from '@/features/pages/NotFound';
import { useCards, useDeck, useWorkspace } from '@/hooks/useData';
import { t } from '@/i18n/en';
import type { Flashcard } from '@/types/models';
import { formatRelative } from '@/utils/dates';
import { MathText } from './MathText';
import { CountsLine } from './StudyScreen';
import { CardDialog, DeckDialog } from './StudyDialogs';
import { reviewPath, studyPath, toStudy, useMinute, useStudyCounts } from './studyData';

const shorten = (text: string) => (text.length > 60 ? `${text.slice(0, 57)}…` : text).replace(/\s+/g, ' ');

/** One deck: its cards, where each stands, and adding, editing and deleting them. */
export default function DeckScreen() {
  const { deckId = '' } = useParams();
  const deck = useDeck(deckId);
  const cards = useCards(deckId);
  const workspace = useWorkspace();
  const { counts } = useStudyCounts();
  const now = useMinute();
  const guarded = useGuarded();
  const toast = useToast();
  const [card, setCard] = useState<Flashcard | 'new' | null>(null);
  const [editingDeck, setEditingDeck] = useState(false);

  if (deck === undefined || cards === undefined) return <LoadingBlock />;
  if (deck === null) return <NotFound />;
  const deckCounts = counts.get(deck.id);

  const remove = (target: Flashcard) =>
    void guarded(async () => {
      const deleted = await deleteCard(target.id);
      toast({ message: t.study.cardDeleted, action: { label: t.common.undo, run: () => void guarded(() => restoreCard(deleted)) } });
    });

  const sourceOf = (target: Flashcard) => {
    if (!target.sourcePageId) return null;
    const page = workspace?.pages.find((p) => p.id === target.sourcePageId);
    return (
      <p className="text-xs text-muted">
        {t.study.fromPage}{' '}
        {page ? (
          <Link to={pagePath(page.id)} className="text-ink underline underline-offset-2">
            {page.title}
          </Link>
        ) : (
          t.study.sourceMissing
        )}
      </p>
    );
  };

  const when = (target: Flashcard) => (target.state === 'new' ? t.study.stateNew : target.due <= now ? t.study.dueNow : t.study.dueAt(formatRelative(target.due, now)));

  return (
    <>
      <PageHeader
        title={deck.name}
        description={deck.description || undefined}
        actions={
          <>
            <Button icon={Pencil} onClick={() => setEditingDeck(true)}>
              {t.study.editDeck}
            </Button>
            <Button icon={Plus} onClick={() => setCard('new')}>
              {t.study.addCard}
            </Button>
            {toStudy(deckCounts) > 0 && (
              <Link to={reviewPath(deck.id)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-on-accent hover:opacity-90 pointer-coarse:min-h-11">
                <Play size={16} aria-hidden />
                {t.study.study}
              </Link>
            )}
          </>
        }
      >
        <Breadcrumbs items={[{ label: t.study.title, to: studyPath }, { label: deck.name }]} />
      </PageHeader>
      <div className="mb-4">
        <CountsLine counts={deckCounts} />
      </div>
      {cards.length === 0 ? (
        <EmptyState icon={Layers} title={t.study.noCards} body={t.study.frontHint} action={<Button variant="primary" icon={Plus} onClick={() => setCard('new')}>{t.study.addCard}</Button>} />
      ) : (
        <ul className="grid gap-2">
          {cards.map((item) => (
            <li key={item.id} className="flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3">
              <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-2 sm:gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted">{t.study.front}</p>
                  <MathText text={item.front} className="block text-ink" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted">{t.study.back}</p>
                  <MathText text={item.back} className="block text-ink" />
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted">{when(item)}</p>
                  {sourceOf(item)}
                </div>
              </div>
              <Menu
                label={t.study.cardActions(shorten(item.front))}
                items={[
                  { id: 'edit', label: t.study.editCard, icon: Pencil, onSelect: () => setCard(item) },
                  { id: 'delete', label: t.study.deleteCard, icon: Trash2, danger: true, onSelect: () => remove(item) },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
      {card && <CardDialog card={card === 'new' ? null : card} deckId={deck.id} onClose={() => setCard(null)} />}
      {editingDeck && <DeckDialog deck={deck} onClose={() => setEditingDeck(false)} />}
    </>
  );
}
