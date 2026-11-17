import { type Card, type Grade, Rating as FsrsRating, State, createEmptyCard, fsrs } from 'ts-fsrs';
import { type CardMemory, RATINGS, type Rating } from '@/types/models';

/**
 * Spaced repetition with FSRS (ts-fsrs). The only file that imports the
 * library: the rest of the app speaks `CardMemory` and `Rating`, so the
 * scheduler can be changed or upgraded without touching stored cards.
 *
 * FSRS models each card's memory with two numbers, stability and difficulty,
 * and schedules the next review for when the chance of recall falls to the
 * desired retention. New and forgotten cards first go through short steps
 * (1 and 10 minutes for a new card, 10 minutes after a lapse).
 */

export interface SchedulerOptions {
  /** Desired retention, 0.7 to 0.97. */
  retention: number;
}

const MAX_INTERVAL_DAYS = 36_500;
const DAY_MS = 86_400_000;

const GRADES: Record<Rating, Grade> = { again: FsrsRating.Again, hard: FsrsRating.Hard, good: FsrsRating.Good, easy: FsrsRating.Easy };
const STATES: Record<State, CardMemory['state']> = { [State.New]: 'new', [State.Learning]: 'learning', [State.Review]: 'review', [State.Relearning]: 'relearning' };
const STATE_OF: Record<CardMemory['state'], State> = { new: State.New, learning: State.Learning, review: State.Review, relearning: State.Relearning };

// One scheduler per retention: they hold only their parameters.
const schedulers = new Map<number, ReturnType<typeof fsrs>>();
function scheduler({ retention }: SchedulerOptions) {
  const key = Math.min(0.97, Math.max(0.7, retention));
  let found = schedulers.get(key);
  if (!found) {
    // Fuzz spreads cards learnt together over nearby days. It is seeded from the card, so it is repeatable.
    found = fsrs({ request_retention: key, maximum_interval: MAX_INTERVAL_DAYS, enable_fuzz: true, enable_short_term: true });
    schedulers.set(key, found);
  }
  return found;
}

function toCard(memory: CardMemory, now: number): Card {
  return {
    due: new Date(memory.due),
    stability: memory.stability,
    difficulty: memory.difficulty,
    elapsed_days: memory.lastReview === null ? 0 : Math.max(0, Math.floor((now - memory.lastReview) / DAY_MS)),
    scheduled_days: memory.scheduledDays,
    learning_steps: memory.learningSteps,
    reps: memory.reps,
    lapses: memory.lapses,
    state: STATE_OF[memory.state],
    last_review: memory.lastReview === null ? undefined : new Date(memory.lastReview),
  };
}

function fromCard(card: Card): CardMemory {
  return {
    state: STATES[card.state],
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    lastReview: card.last_review ? card.last_review.getTime() : null,
  };
}

/** A card that has never been studied. It is due at once. */
export function newMemory(now: number): CardMemory {
  return fromCard(createEmptyCard(new Date(now)));
}

/** The card's memory after answering it with `rating` at `now`. */
export function schedule(memory: CardMemory, rating: Rating, now: number, options: SchedulerOptions): CardMemory {
  return fromCard(scheduler(options).next(toCard(memory, now), new Date(now), GRADES[rating]).card);
}

/** When the card would next be due for each answer: shown on the answer buttons. */
export function preview(memory: CardMemory, now: number, options: SchedulerOptions): Record<Rating, number> {
  const outcomes = scheduler(options).repeat(toCard(memory, now), new Date(now));
  return Object.fromEntries(RATINGS.map((rating) => [rating, outcomes[GRADES[rating]].card.due.getTime()])) as Record<Rating, number>;
}

/** Chance, 0 to 1, of recalling the card at `now`. 0 for a card never studied. */
export function recall(memory: CardMemory, now: number, options: SchedulerOptions): number {
  if (memory.state === 'new') return 0;
  return scheduler(options).get_retrievability(toCard(memory, now), new Date(now), false);
}
