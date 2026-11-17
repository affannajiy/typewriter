import { useEffect, useMemo, useState } from 'react';
import { useCards, useReviewLogs, useSettings } from '@/hooks/useData';
import type { Id } from '@/types/models';
import { type DeckCounts, deckCounts, startOfDay } from './queue';

/**
 * Study data shared by the study screens and the dashboard. Kept apart from
 * the screens so the dashboard does not load KaTeX or the scheduler.
 */

export const studyPath = '/study';
export const deckPath = (id: Id) => `/study/deck/${id}`;
export const reviewPath = (id: Id | 'all') => `/study/review/${id}`;

/** The current time, moved on each minute, so due counts follow the clock. */
export function useMinute(): number {
  const [time, setTime] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setTime(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return time;
}

/** What each deck has to study now, and how many cards it holds. */
export function useStudyCounts(): { counts: Map<Id, DeckCounts>; loaded: boolean } {
  const time = useMinute();
  const settings = useSettings();
  const cards = useCards();
  const today = startOfDay(time);
  const logs = useReviewLogs(today);
  const counts = useMemo(
    () => (cards && logs ? deckCounts(cards, logs, { now: time, newPerDay: settings.studyNewPerDay, startOfDay: today }) : new Map<Id, DeckCounts>()),
    [cards, logs, time, settings.studyNewPerDay, today],
  );
  return { counts, loaded: cards !== undefined && logs !== undefined };
}

/** Cards a deck has to study now. */
export const toStudy = (counts: DeckCounts | undefined): number => (counts ? counts.new + counts.learning + counts.review : 0);
