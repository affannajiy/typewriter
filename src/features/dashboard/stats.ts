import type { WritingDay } from '@/types/models';
import { addDays, dayKey } from '@/utils/dates';

export interface DayTotal {
  date: Date;
  key: string;
  words: number;
}

export interface WritingSummary {
  /** Words written today. */
  today: number;
  /**
   * Days in a row with words written, ending today. A day with nothing
   * written yet does not break the streak until it is over.
   */
  streak: number;
  /** The last seven days, oldest first, today last. Days without writing are 0. */
  week: DayTotal[];
}

export function summariseWriting(days: WritingDay[], now: Date = new Date()): WritingSummary {
  const words = new Map(days.map((day) => [day.date, day.words]));
  const on = (date: Date) => words.get(dayKey(date)) ?? 0;

  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(now, i - 6);
    return { date, key: dayKey(date), words: on(date) };
  });

  let streak = 0;
  let cursor = on(now) > 0 ? addDays(now, 0) : addDays(now, -1);
  while (on(cursor) > 0) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return { today: on(now), streak, week };
}
