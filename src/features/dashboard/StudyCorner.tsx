import { GraduationCap, Play } from 'lucide-react';
import { Link } from 'react-router';
import { Section } from '@/components/ui/Layout';
import { reviewPath, studyPath, toStudy, useStudyCounts } from '@/features/study/studyData';
import { useDecks } from '@/hooks/useData';
import { t } from '@/i18n/en';

/** The study corner of the desk: how many flashcards wait today. Hidden until there is a deck. */
export function StudyCorner() {
  const decks = useDecks();
  const { counts, loaded } = useStudyCounts();
  if (!decks || decks.length === 0 || !loaded) return null;
  const due = decks.reduce((sum, deck) => sum + toStudy(counts.get(deck.id)), 0);
  return (
    <Section title={t.dashboard.study.title}>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <GraduationCap size={22} aria-hidden className="shrink-0 text-accent" />
        <p className="min-w-40 flex-1 text-sm text-ink tabular-nums">{due > 0 ? t.dashboard.study.due(due) : t.dashboard.study.none}</p>
        {due > 0 ? (
          <Link to={reviewPath('all')} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-on-accent hover:opacity-90 pointer-coarse:min-h-11">
            <Play size={16} aria-hidden />
            {t.dashboard.study.open}
          </Link>
        ) : (
          <Link to={studyPath} className="inline-flex min-h-10 items-center rounded-md border border-line-strong px-3 text-sm text-ink hover:bg-accent-soft pointer-coarse:min-h-11">
            {t.dashboard.study.decks}
          </Link>
        )}
      </div>
    </Section>
  );
}
