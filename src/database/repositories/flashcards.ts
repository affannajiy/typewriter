import { db } from '@/database/db';
import type { SchedulerOptions } from '@/services/scheduler';
import type { CardMemory, Deck, Flashcard, Id, Rating, ReviewLog } from '@/types/models';
import { RepositoryError, bump, byOrder, cleanName, found, freshVersion, newId, now, orderAfter } from './common';

/**
 * Decks, flashcards and their review history (schema version 5).
 *
 * A review writes the card's new memory and a log in one transaction. The
 * log keeps the memory from before, so the last answer can be undone.
 * Deleting a card returns what was removed, so the interface can offer Undo;
 * deleting a deck is permanent and the interface confirms it first.
 */

export const MAX_CARD_TEXT = 5000;
export const MAX_DECK_DESCRIPTION = 1000;
export const UNTITLED_DECK = 'Untitled deck';

/** A card never studied: due at once. The same as the scheduler's empty card (scheduler.test.ts checks it). */
export const newMemory = (now: number): CardMemory => ({ state: 'new', due: now, stability: 0, difficulty: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, lastReview: null });

const cardText = (raw: string) => raw.replace(/\r\n?/g, '\n').trim().slice(0, MAX_CARD_TEXT);

export async function listDecks(): Promise<Deck[]> {
  return (await db.decks.toArray()).sort(byOrder);
}

export const getDeck = (id: Id) => db.decks.get(id);

export async function createDeck(input: { name: string; description?: string }): Promise<Deck> {
  return db.transaction('rw', db.decks, async () => {
    const deck: Deck = {
      ...freshVersion(),
      name: cleanName(input.name, UNTITLED_DECK),
      description: (input.description ?? '').trim().slice(0, MAX_DECK_DESCRIPTION),
      order: orderAfter(await db.decks.toArray()),
    };
    await db.decks.add(deck);
    return deck;
  });
}

export async function updateDeck(id: Id, input: { name: string; description: string }): Promise<void> {
  await db.transaction('rw', db.decks, async () => {
    const deck = found(await db.decks.get(id), 'Deck');
    await db.decks.update(id, bump(deck, { name: cleanName(input.name, deck.name), description: input.description.trim().slice(0, MAX_DECK_DESCRIPTION) }));
  });
}

/** Deletes the deck, its cards and their history. Cannot be undone: the interface asks first. */
export async function deleteDeck(id: Id): Promise<number> {
  return db.transaction('rw', db.decks, db.flashcards, db.reviewLogs, async () => {
    found(await db.decks.get(id), 'Deck');
    const cards = await db.flashcards.where('deckId').equals(id).primaryKeys();
    await db.reviewLogs.where('deckId').equals(id).delete();
    await db.flashcards.bulkDelete(cards);
    await db.decks.delete(id);
    return cards.length;
  });
}

/** Every card, or one deck's, oldest first. */
export async function listCards(deckId?: Id): Promise<Flashcard[]> {
  const cards = deckId === undefined ? await db.flashcards.toArray() : await db.flashcards.where('deckId').equals(deckId).toArray();
  return cards.sort((a, b) => a.createdAt - b.createdAt);
}

export const getCard = (id: Id) => db.flashcards.get(id);

/** Answers given since `since`, oldest first. */
export async function listReviewLogs(since: number): Promise<ReviewLog[]> {
  return db.reviewLogs.where('reviewedAt').aboveOrEqual(since).sortBy('reviewedAt');
}

export interface CardInput {
  deckId: Id;
  front: string;
  back: string;
  sourcePageId?: Id | null;
}

function checkFront(front: string): string {
  const text = cardText(front);
  if (text === '') throw new RepositoryError('invalid-card', 'A card needs a question');
  return text;
}

export async function createCard(input: CardInput): Promise<Flashcard> {
  return db.transaction('rw', db.decks, db.flashcards, async () => {
    found(await db.decks.get(input.deckId), 'Deck');
    const version = freshVersion();
    const card: Flashcard = {
      ...version,
      ...newMemory(version.createdAt),
      deckId: input.deckId,
      front: checkFront(input.front),
      back: cardText(input.back),
      sourcePageId: input.sourcePageId ?? null,
    };
    await db.flashcards.add(card);
    return card;
  });
}

/** Changes the text or the deck. The card keeps its schedule: editing is not forgetting. */
export async function updateCard(id: Id, input: { front: string; back: string; deckId: Id }): Promise<void> {
  await db.transaction('rw', db.decks, db.flashcards, db.reviewLogs, async () => {
    const card = found(await db.flashcards.get(id), 'Card');
    found(await db.decks.get(input.deckId), 'Deck');
    await db.flashcards.update(id, bump(card, { front: checkFront(input.front), back: cardText(input.back), deckId: input.deckId }));
    if (input.deckId !== card.deckId) await db.reviewLogs.where('cardId').equals(id).modify({ deckId: input.deckId });
  });
}

/** What deleting a card removed, so Undo can put it back exactly. */
export interface DeletedCard {
  card: Flashcard;
  logs: ReviewLog[];
}

export async function deleteCard(id: Id): Promise<DeletedCard> {
  return db.transaction('rw', db.flashcards, db.reviewLogs, async () => {
    const card = found(await db.flashcards.get(id), 'Card');
    const logs = await db.reviewLogs.where('cardId').equals(id).toArray();
    await db.reviewLogs.bulkDelete(logs.map((log) => log.id));
    await db.flashcards.delete(id);
    return { card, logs };
  });
}

/** Undo for deleteCard. If the deck has gone meanwhile, the card cannot come back. */
export async function restoreCard(deleted: DeletedCard): Promise<void> {
  await db.transaction('rw', db.decks, db.flashcards, db.reviewLogs, async () => {
    found(await db.decks.get(deleted.card.deckId), 'Deck');
    await db.flashcards.put(deleted.card);
    await db.reviewLogs.bulkPut(deleted.logs);
  });
}

/** Answers a card: stores its next schedule and the answer, together. Returns the log. */
export async function reviewCard(id: Id, rating: Rating, options: SchedulerOptions, at = now()): Promise<ReviewLog> {
  // The scheduler loads with the first review, not with the app. Loaded before the
  // transaction: waiting on anything but the database inside it would end it early.
  const { schedule } = await import('@/services/scheduler');
  return db.transaction('rw', db.flashcards, db.reviewLogs, async () => {
    const card = found(await db.flashcards.get(id), 'Card');
    const { state, due, stability, difficulty, scheduledDays, learningSteps, reps, lapses, lastReview } = card;
    const before = { state, due, stability, difficulty, scheduledDays, learningSteps, reps, lapses, lastReview };
    const log: ReviewLog = { id: newId(), cardId: id, deckId: card.deckId, rating, reviewedAt: at, before };
    // A review is not an edit of the card's text, but it is a change: rev goes up so a sync can see it.
    await db.flashcards.update(id, { ...schedule(before, rating, at, options), updatedAt: at, rev: card.rev + 1 });
    await db.reviewLogs.add(log);
    return log;
  });
}

/** Takes back an answer: the card's memory returns to what it was. Only the card's latest answer can be undone. */
export async function undoReview(logId: Id): Promise<Flashcard> {
  return db.transaction('rw', db.flashcards, db.reviewLogs, async () => {
    const log = found(await db.reviewLogs.get(logId), 'Review');
    const card = found(await db.flashcards.get(log.cardId), 'Card');
    const latest = (await db.reviewLogs.where('cardId').equals(log.cardId).sortBy('reviewedAt')).at(-1);
    if (latest?.id !== logId) throw new RepositoryError('not-found', 'Only the latest review can be undone');
    const restored: Flashcard = { ...card, ...log.before, updatedAt: now(), rev: card.rev + 1 };
    await db.flashcards.put(restored);
    await db.reviewLogs.delete(logId);
    return restored;
  });
}

/** How many cards were made from each page. */
export async function cardsFromPage(pageId: Id): Promise<Flashcard[]> {
  return db.flashcards.where('sourcePageId').equals(pageId).toArray();
}
