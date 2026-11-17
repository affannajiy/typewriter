import { CheckCircle2, Eye, FileText, Pencil, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button, cx } from '@/components/ui/Button';
import { Breadcrumbs, EmptyState, LoadingBlock, PageHeader } from '@/components/ui/Layout';
import { useToast } from '@/components/ui/Toast';
import { reviewCard, undoReview } from '@/database/repositories/flashcards';
import { pagePath } from '@/features/organisation/items';
import { useGuarded } from '@/features/organisation/useItemActions';
import { NotFound } from '@/features/pages/NotFound';
import { useCards, useDeck, useReviewLogs, useSettings } from '@/hooks/useData';
import { t } from '@/i18n/en';
import { preview } from '@/services/scheduler';
import { type Flashcard, type Id, RATINGS, type Rating, type ReviewLog } from '@/types/models';
import { formatRelative } from '@/utils/dates';
import { MathText } from './MathText';
import { CardDialog } from './StudyDialogs';
import { startOfDay, studyQueue } from './queue';
import { deckPath, studyPath } from './studyData';

const RATING_KEYS: Record<string, Rating> = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' };

/** True when a key press belongs to a field, a menu or a dialog, not to the review. */
const typingElsewhere = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  return Boolean(target?.closest('input, textarea, select, [contenteditable="true"], [role="menu"]')) || Boolean(document.querySelector('dialog[open]'));
};

/**
 * A study session: one card at a time. Show the answer, then say how well it
 * was remembered; FSRS sets when the card comes back. The last answer can be
 * undone. Everything works from the keyboard: Space, 1 to 4, and Z.
 */
export default function ReviewScreen() {
  const { deckId = 'all' } = useParams();
  const all = deckId === 'all';
  const deck = useDeck(all ? '' : deckId);
  const cards = useCards(all ? undefined : deckId);
  const settings = useSettings();
  const guarded = useGuarded();
  const toast = useToast();
  const [now, setNow] = useState(() => Date.now());
  const today = startOfDay(now);
  const logs = useReviewLogs(today);
  const [revealed, setRevealed] = useState(false);
  const [answered, setAnswered] = useState(0);
  const [lastLog, setLastLog] = useState<ReviewLog | null>(null);
  /** Cards just answered, until the database hands back their new schedule. */
  const [pending, setPending] = useState<Map<Id, number>>(() => new Map());
  /** A card brought back by Undo is shown next. */
  const [priority, setPriority] = useState<Id | null>(null);
  const [editing, setEditing] = useState<Flashcard | null>(null);
  const [busy, setBusy] = useState(false);
  const options = useMemo(() => ({ retention: settings.studyRetention / 100 }), [settings.studyRetention]);

  // Learning steps are minutes long: look again every half minute.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const queue = useMemo(() => {
    if (!cards || !logs) return [];
    const settled = cards.filter((card) => card.updatedAt >= (pending.get(card.id) ?? 0));
    const list = studyQueue(settled, logs, { now, newPerDay: settings.studyNewPerDay, startOfDay: today });
    const first = priority ? list.find((card) => card.id === priority) : undefined;
    return first ? [first, ...list.filter((card) => card !== first)] : list;
  }, [cards, logs, now, pending, priority, settings.studyNewPerDay, today]);

  const current = queue[0] ?? null;
  const outcomes = useMemo(() => (current && revealed ? preview(current, now, options) : null), [current, revealed, options, now]);

  const answer = useCallback(
    (rating: Rating) => {
      if (!current || !revealed || busy) return;
      setBusy(true);
      void guarded(async () => {
        const at = Date.now();
        const log = await reviewCard(current.id, rating, options, at);
        setPending((map) => new Map(map).set(current.id, at));
        setLastLog(log);
        setAnswered((n) => n + 1);
        setPriority(null);
        setRevealed(false);
        setNow(Date.now());
      }).finally(() => setBusy(false));
    },
    [current, revealed, busy, guarded, options],
  );

  const undo = useCallback(() => {
    if (!lastLog || busy) return;
    setBusy(true);
    void guarded(async () => {
      const card = await undoReview(lastLog.id);
      setPending((map) => {
        const next = new Map(map);
        next.delete(card.id);
        return next;
      });
      setLastLog(null);
      setAnswered((n) => Math.max(0, n - 1));
      setPriority(card.id);
      setRevealed(false);
      setNow(Date.now());
      toast({ message: t.study.review.undone });
    }).finally(() => setBusy(false));
  }, [lastLog, busy, guarded, toast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || typingElsewhere(event)) return;
      if ((event.key === ' ' || event.key === 'Enter') && !revealed && current) {
        // A focused button handles its own Space and Enter.
        if ((event.target as HTMLElement | null)?.closest('button, a')) return;
        event.preventDefault();
        setRevealed(true);
      } else if (RATING_KEYS[event.key] && revealed) {
        event.preventDefault();
        answer(RATING_KEYS[event.key]!);
      } else if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [revealed, current, answer, undo]);

  if (cards === undefined || logs === undefined || (!all && deck === undefined)) return <LoadingBlock />;
  if (!all && deck === null) return <NotFound />;
  const name = all ? t.study.allDecks : deck!.name;
  const backTo = all ? studyPath : deckPath(deckId);
  const nextDue = cards.filter((card) => card.state !== 'new' && card.due > now).reduce<number | null>((min, card) => (min === null || card.due < min ? card.due : min), null);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t.study.review.title(name)}>
        <Breadcrumbs items={[{ label: t.study.title, to: studyPath }, ...(all ? [] : [{ label: name, to: backTo }]), { label: t.study.study }]} />
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-sm text-muted tabular-nums">
          {t.study.review.progress(answered, queue.length)}
        </p>
        <Button variant="ghost" icon={Undo2} disabled={!lastLog || busy} onClick={undo}>
          {t.study.review.undo}
        </Button>
      </div>

      {!current ? (
        <EmptyState
          icon={CheckCircle2}
          title={t.study.review.finishedTitle}
          body={[t.study.review.finishedBody(answered), nextDue !== null ? t.study.nextDue(formatRelative(nextDue, now)) : ''].filter(Boolean).join(' ')}
          action={
            <Link to={backTo} className="inline-flex min-h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-on-accent">
              {t.study.backToDecks}
            </Link>
          }
        />
      ) : (
        <article aria-label={t.study.review.question} className="rounded-xl border border-line bg-surface shadow-soft">
          <section className="px-6 pt-6 pb-4">
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{t.study.review.question}</h2>
            <MathText text={current.front} className="block font-serif text-2xl text-ink" />
          </section>
          {revealed ? (
            <section aria-live="polite" className="border-t border-dashed border-line-strong px-6 pt-4 pb-6">
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{t.study.review.answer}</h2>
              <MathText text={current.back} className="block font-serif text-xl text-ink" />
            </section>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 border-t border-line bg-sunken/40 px-4 py-3">
            {current.sourcePageId && (
              <Link to={pagePath(current.sourcePageId)} className="inline-flex min-h-10 items-center gap-2 rounded-md px-2 text-sm text-muted hover:text-ink">
                <FileText size={16} aria-hidden />
                {t.study.review.openSource}
              </Link>
            )}
            <Button variant="ghost" icon={Pencil} onClick={() => setEditing(current)}>
              {t.study.review.edit}
            </Button>
          </div>
        </article>
      )}

      {current && !revealed && (
        <div className="mt-4 flex justify-center">
          <Button variant="primary" icon={Eye} onClick={() => setRevealed(true)} className="min-w-48">
            {t.study.review.show}
          </Button>
        </div>
      )}

      {current && revealed && outcomes && (
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium text-ink">{t.study.review.ratingsLegend}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RATINGS.map((rating, index) => (
              <button
                key={rating}
                type="button"
                disabled={busy}
                onClick={() => answer(rating)}
                title={t.study.review.ratingHelp[rating]}
                className={cx(
                  'flex min-h-14 flex-col items-center justify-center rounded-lg border px-2 py-1 text-ink hover:bg-accent-soft disabled:opacity-50',
                  rating === 'good' ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface',
                )}
              >
                <span className="font-medium">
                  <kbd className="me-1.5 rounded border border-line px-1 font-sans text-xs text-muted">{index + 1}</kbd>
                  {t.study.review.ratings[rating]}
                </span>
                <span className="text-xs text-muted">{t.study.review.next(t.study.interval(outcomes[rating] - now))}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <p aria-hidden className="mt-6 text-center text-xs text-muted">
        {t.study.review.keys}
      </p>

      {editing && <CardDialog card={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
