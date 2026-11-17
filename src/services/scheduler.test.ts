import { describe, expect, it } from 'vitest';
import { newMemory as repositoryNewMemory } from '@/database/repositories/flashcards';
import { newMemory, preview, recall, schedule } from './scheduler';

const AT = Date.UTC(2026, 10, 17, 9, 0);
const DAY = 86_400_000;
const options = { retention: 0.9 };

/** A card learnt today with Good twice, then due for its first real review. */
function graduated() {
  const learning = schedule(newMemory(AT), 'good', AT, options);
  return schedule(learning, 'good', learning.due, options);
}

describe('FSRS scheduler', () => {
  it('starts a card as new and due at once', () => {
    expect(newMemory(AT)).toEqual({ state: 'new', due: AT, stability: 0, difficulty: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, lastReview: null });
    // The repository makes new cards without loading the scheduler; both must agree.
    expect(repositoryNewMemory(AT)).toEqual(newMemory(AT));
  });

  it('graduates a card after its learning steps, with stability and difficulty set', () => {
    const card = graduated();
    expect(card.state).toBe('review');
    expect(card.reps).toBe(2);
    expect(card.stability).toBeGreaterThan(0);
    expect(card.difficulty).toBeGreaterThanOrEqual(1);
    expect(card.difficulty).toBeLessThanOrEqual(10);
    expect(card.due - card.lastReview!).toBeGreaterThanOrEqual(DAY);
  });

  it('gives longer gaps for better answers, and sends a forgotten card back to relearning', () => {
    const card = graduated();
    const at = card.due;
    const gaps = preview(card, at, options);
    expect(gaps.again).toBeLessThan(gaps.hard);
    expect(gaps.hard).toBeLessThan(gaps.good);
    expect(gaps.good).toBeLessThan(gaps.easy);
    const forgotten = schedule(card, 'again', at, options);
    expect(forgotten).toMatchObject({ state: 'relearning', lapses: 1 });
    expect(forgotten.stability).toBeLessThan(card.stability);
  });

  it('agrees with its own preview, and is repeatable', () => {
    const card = graduated();
    const at = card.due + 2 * DAY;
    expect(preview(card, at, options).good).toBe(schedule(card, 'good', at, options).due);
    expect(schedule(card, 'good', at, options)).toEqual(schedule(card, 'good', at, options));
  });

  it('asks for reviews sooner when the target recall is higher', () => {
    const card = graduated();
    const at = card.due;
    const relaxed = schedule(card, 'good', at, { retention: 0.8 });
    const strict = schedule(card, 'good', at, { retention: 0.95 });
    expect(strict.due).toBeLessThan(relaxed.due);
  });

  it('estimates recall: none for a new card, high just after a review, lower later', () => {
    expect(recall(newMemory(AT), AT, options)).toBe(0);
    const card = graduated();
    const soon = recall(card, card.lastReview! + 1000, options);
    const later = recall(card, card.lastReview! + 60 * DAY, options);
    expect(soon).toBeGreaterThan(0.95);
    expect(later).toBeLessThan(soon);
  });
});
