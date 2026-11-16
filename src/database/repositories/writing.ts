import { db } from '@/database/db';
import type { WritingDay } from '@/types/models';
import { dayKey } from '@/utils/dates';
import { now } from './common';

/**
 * The words-written log: one row per calendar day on which something was
 * written. Page saves add to it (see savePageDraft); nothing else writes it,
 * apart from restoring a backup.
 */

/**
 * Adds words to a day. Call inside a read-write transaction that includes
 * `db.writingDays`, so the count and the page change commit together.
 */
export async function addWordsWritten(words: number, date: Date = new Date()): Promise<void> {
  if (!Number.isFinite(words) || words <= 0) return;
  const key = dayKey(date);
  const day = await db.writingDays.get(key);
  await db.writingDays.put({ date: key, words: (day?.words ?? 0) + Math.round(words), updatedAt: now() });
}

/** Days from `from` (a `YYYY-MM-DD` key) onwards, oldest first. */
export async function listWritingDays(from: string): Promise<WritingDay[]> {
  return db.writingDays.where('date').aboveOrEqual(from).sortBy('date');
}
