import type { Flashcard, Id, ReviewLog } from '@/types/models';

/**
 * Which cards to study now, and in what order. Pure, so it is tested without
 * a database.
 *
 * - Cards being learnt or relearnt that are due come first, soonest first:
 *   their steps are minutes long.
 * - Then review cards that are due, most overdue first.
 * - Then new cards, oldest first, up to the daily limit of each deck. New
 *   cards already answered today count against the limit.
 * - When nothing else is left, a card in its learning steps that is due in
 *   the next 20 minutes is shown early, so a session can finish.
 */

export const LEARN_AHEAD_MS = 20 * 60_000;

export interface QueueOptions {
  now: number;
  /** New cards per deck per day. */
  newPerDay: number;
  /** The start of today, local time: answers since then count as today's. */
  startOfDay: number;
}

const inSteps = (card: Flashcard) => card.state === 'learning' || card.state === 'relearning';
const byDue = (a: Flashcard, b: Flashcard) => a.due - b.due || a.createdAt - b.createdAt;

/** New cards each deck has already started today. */
export function newStartedToday(logs: ReviewLog[], startOfDay: number): Map<Id, number> {
  const counts = new Map<Id, number>();
  for (const log of logs) {
    if (log.reviewedAt >= startOfDay && log.before.state === 'new') counts.set(log.deckId, (counts.get(log.deckId) ?? 0) + 1);
  }
  return counts;
}

export function studyQueue(cards: Flashcard[], logs: ReviewLog[], { now, newPerDay, startOfDay }: QueueOptions): Flashcard[] {
  const learning = cards.filter((card) => inSteps(card) && card.due <= now).sort(byDue);
  const review = cards.filter((card) => card.state === 'review' && card.due <= now).sort(byDue);

  const started = newStartedToday(logs, startOfDay);
  const room = new Map<Id, number>();
  const fresh: Flashcard[] = [];
  for (const card of cards.filter((c) => c.state === 'new').sort((a, b) => a.createdAt - b.createdAt)) {
    const left = room.get(card.deckId) ?? Math.max(0, newPerDay - (started.get(card.deckId) ?? 0));
    if (left > 0) fresh.push(card);
    room.set(card.deckId, left - 1);
  }

  const queue = [...learning, ...review, ...fresh];
  if (queue.length > 0) return queue;
  return cards.filter((card) => inSteps(card) && card.due <= now + LEARN_AHEAD_MS).sort(byDue);
}

export interface DeckCounts {
  /** New cards that today's limit still allows. */
  new: number;
  /** Cards in their learning steps that are due. */
  learning: number;
  /** Review cards that are due. */
  review: number;
  total: number;
}

/** What each deck has to study now. Decks with no cards are missing from the map. */
export function deckCounts(cards: Flashcard[], logs: ReviewLog[], options: QueueOptions): Map<Id, DeckCounts> {
  const counts = new Map<Id, DeckCounts>();
  const slot = (deckId: Id) => {
    let entry = counts.get(deckId);
    if (!entry) counts.set(deckId, (entry = { new: 0, learning: 0, review: 0, total: 0 }));
    return entry;
  };
  for (const card of cards) slot(card.deckId).total++;
  const started = newStartedToday(logs, options.startOfDay);
  for (const card of cards) {
    const entry = slot(card.deckId);
    if (card.state === 'new') {
      if (entry.new < Math.max(0, options.newPerDay - (started.get(card.deckId) ?? 0))) entry.new++;
    } else if (card.due <= options.now) {
      if (inSteps(card)) entry.learning++;
      else entry.review++;
    }
  }
  return counts;
}

/** Local midnight of the day that holds `time`. */
export function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
