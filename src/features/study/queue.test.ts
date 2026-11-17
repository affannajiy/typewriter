import { describe, expect, it } from 'vitest';
import type { CardMemory, Flashcard, ReviewLog } from '@/types/models';
import { LEARN_AHEAD_MS, deckCounts, startOfDay, studyQueue } from './queue';

const NOW = Date.UTC(2026, 10, 17, 12, 0);
const TODAY = NOW - 12 * 3_600_000;
const MINUTE = 60_000;

let next = 0;
function card(deckId: string, memory: Partial<CardMemory>, createdAt = next++): Flashcard {
  return {
    id: `c${next++}`,
    createdAt,
    updatedAt: createdAt,
    rev: 1,
    deckId,
    front: 'Q',
    back: 'A',
    sourcePageId: null,
    state: 'new',
    due: 0,
    stability: 0,
    difficulty: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    lastReview: null,
    ...memory,
  };
}

const startedNew = (deckId: string, reviewedAt = NOW - MINUTE): ReviewLog => ({
  id: `l${next++}`,
  cardId: 'x',
  deckId,
  rating: 'good',
  reviewedAt,
  before: { state: 'new', due: 0, stability: 0, difficulty: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, lastReview: null },
});

const options = { now: NOW, newPerDay: 2, startOfDay: TODAY };

describe('study queue', () => {
  it('puts due learning cards first, then due reviews by how overdue, then new cards oldest first', () => {
    const fresh1 = card('d', {}, 1);
    const fresh2 = card('d', {}, 2);
    const review = card('d', { state: 'review', due: NOW - 5 * MINUTE });
    const overdue = card('d', { state: 'review', due: NOW - 3 * 86_400_000 });
    const learning = card('d', { state: 'learning', due: NOW - MINUTE });
    const later = card('d', { state: 'review', due: NOW + 86_400_000 });
    const queue = studyQueue([fresh2, review, later, fresh1, overdue, learning], [], options);
    expect(queue.map((c) => c.id)).toEqual([learning.id, overdue.id, review.id, fresh1.id, fresh2.id]);
  });

  it('limits new cards per deck per day, counting new cards already answered today', () => {
    const cards = ['a', 'a', 'a', 'b', 'b'].map((deck) => card(deck, {}));
    expect(studyQueue(cards, [], options).map((c) => c.deckId)).toEqual(['a', 'a', 'b', 'b']);
    const logs = [startedNew('a'), startedNew('b', TODAY - MINUTE)];
    // Deck a started one new card today; deck b's was yesterday and does not count.
    expect(studyQueue(cards, logs, options).map((c) => c.deckId)).toEqual(['a', 'b', 'b']);
    expect(studyQueue(cards, [], { ...options, newPerDay: 0 })).toEqual([]);
  });

  it('shows a learning card early only when nothing else is left', () => {
    const soon = card('d', { state: 'relearning', due: NOW + LEARN_AHEAD_MS - 1 });
    const tooLate = card('d', { state: 'learning', due: NOW + LEARN_AHEAD_MS + 1 });
    expect(studyQueue([soon, tooLate], [], options).map((c) => c.id)).toEqual([soon.id]);
    const fresh = card('d', {});
    expect(studyQueue([soon, fresh], [], options).map((c) => c.id)).toEqual([fresh.id]);
  });

  it('counts what each deck has to study, within the new-card limit', () => {
    const cards = [card('a', {}), card('a', {}), card('a', {}), card('a', { state: 'review', due: NOW - 1 }), card('a', { state: 'learning', due: NOW - 1 }), card('a', { state: 'review', due: NOW + 1 }), card('b', {})];
    const counts = deckCounts(cards, [startedNew('a')], options);
    expect(counts.get('a')).toEqual({ new: 1, learning: 1, review: 1, total: 6 });
    expect(counts.get('b')).toEqual({ new: 1, learning: 0, review: 0, total: 1 });
    expect(counts.has('c')).toBe(false);
  });

  it('finds local midnight', () => {
    const time = new Date(2026, 10, 17, 15, 30).getTime();
    expect(startOfDay(time)).toBe(new Date(2026, 10, 17).getTime());
  });
});
