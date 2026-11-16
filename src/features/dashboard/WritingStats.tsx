import { Flame, NotebookPen, PenLine } from 'lucide-react';
import type { ReactNode } from 'react';
import { Section } from '@/components/ui/Layout';
import { useWritingDays } from '@/hooks/useData';
import { t } from '@/i18n/en';
import type { Page } from '@/types/models';
import { formatWeekday } from '@/utils/dates';
import { countWords } from '@/utils/text';
import { summariseWriting } from './stats';

function Tile({ icon, label, value, children }: { icon: ReactNode; label: string; value: string; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface px-4 py-3">
      <p className="flex items-center gap-2 text-xs font-medium text-muted">
        {icon}
        {label}
      </p>
      <p className="font-serif text-2xl font-semibold text-ink tabular-nums">{value}</p>
      {children}
    </div>
  );
}

/**
 * Words written: today against the daily goal, the streak, the words in all
 * pages, and the last seven days. Counted by the page saves (see writing.ts).
 */
export function WritingStats({ pages, goal }: { pages: Page[]; goal: number }) {
  const days = useWritingDays();
  if (!days) return null;
  const { today, streak, week } = summariseWriting(days);
  const total = pages.reduce((sum, page) => sum + countWords(page.plainText), 0);
  const most = Math.max(...week.map((day) => day.words), goal, 1);
  const copy = t.dashboard.writing;

  return (
    <Section title={copy.title}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile icon={<PenLine size={14} aria-hidden />} label={copy.today} value={copy.todayWords(today)}>
          {goal > 0 ? (
            <>
              <p className="text-xs text-muted">{today >= goal ? `${copy.goalMet} · ${copy.goal(today, goal)}` : copy.goal(today, goal)}</p>
              {/* The sentence above carries the numbers; the bar only shows them. */}
              <div aria-hidden className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (today / goal) * 100)}%` }} />
              </div>
            </>
          ) : (
            <p className="text-xs text-muted">{copy.noGoal}</p>
          )}
        </Tile>
        <Tile icon={<Flame size={14} aria-hidden />} label={copy.streak} value={copy.streakDays(streak)}>
          <p className="text-xs text-muted">{copy.streakHint}</p>
        </Tile>
        <Tile icon={<NotebookPen size={14} aria-hidden />} label={copy.total} value={copy.totalWords(total)} />
      </div>

      <div className="mt-3 rounded-lg border border-line bg-surface px-4 py-3">
        <h3 id="writing-week" className="mb-2 font-sans text-xs font-medium text-muted">
          {copy.week}
        </h3>
        <ol aria-labelledby="writing-week" className="grid h-28 grid-cols-7 items-end gap-2">
          {week.map((day) => {
            const label = copy.day(formatWeekday(day.date), day.words);
            return (
              <li key={day.key} title={label} className="flex h-full flex-col items-center justify-end gap-1">
                <span className="sr-only">{label}</span>
                <span aria-hidden className="flex w-full max-w-10 flex-1 items-end border-b border-line-strong">
                  {day.words > 0 && <span className="w-full rounded-t bg-accent" style={{ height: `${Math.max(4, (day.words / most) * 100)}%` }} />}
                </span>
                <span aria-hidden className="text-xs text-muted">
                  {formatWeekday(day.date)}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-xs text-muted">{copy.note}</p>
      </div>
    </Section>
  );
}
