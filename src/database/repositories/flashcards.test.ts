import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBackup, parseBackup, restoreBackup, serialiseBackup } from '@/database/backup/backup';
import { BackupError } from '@/database/backup/validate';
import { SCHEMA_VERSION, TypeNoteDB, db } from '@/database/db';
import { RepositoryError } from './common';
import {
  cardsFromPage,
  createCard,
  createDeck,
  deleteCard,
  deleteDeck,
  getCard,
  listCards,
  listDecks,
  listReviewLogs,
  restoreCard,
  reviewCard,
  undoReview,
  updateCard,
  updateDeck,
} from './flashcards';

const options = { retention: 0.9 };
const MINUTE = 60_000;
const DAY = 86_400_000;

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const rejectsWith = async (work: Promise<unknown>, code: string) => {
  const error = await work.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(RepositoryError);
  expect((error as RepositoryError).code).toBe(code);
};

describe('decks and cards', () => {
  it('creates decks in order and cards that are new and due at once', async () => {
    const first = await createDeck({ name: '  Chemistry ', description: 'Organic' });
    const second = await createDeck({ name: '' });
    expect((await listDecks()).map((d) => d.name)).toEqual(['Chemistry', 'Untitled deck']);
    expect(second.order).toBeGreaterThan(first.order);

    const card = await createCard({ deckId: first.id, front: ' What is $H_2O$? ', back: 'Water', sourcePageId: 'page-1' });
    expect(card).toMatchObject({ front: 'What is $H_2O$?', back: 'Water', state: 'new', reps: 0, lapses: 0, lastReview: null, sourcePageId: 'page-1', rev: 1 });
    expect(card.due).toBeLessThanOrEqual(Date.now());
    expect((await cardsFromPage('page-1')).map((c) => c.id)).toEqual([card.id]);
  });

  it('refuses a card without a question, or in a deck that does not exist', async () => {
    const deck = await createDeck({ name: 'D' });
    await rejectsWith(createCard({ deckId: deck.id, front: '   ', back: 'x' }), 'invalid-card');
    await rejectsWith(createCard({ deckId: 'nope', front: 'Q', back: 'A' }), 'not-found');
    expect(await listCards()).toEqual([]);
  });

  it('edits a card and moves it to another deck without forgetting its schedule', async () => {
    const a = await createDeck({ name: 'A' });
    const b = await createDeck({ name: 'B' });
    const card = await createCard({ deckId: a.id, front: 'Q', back: 'A' });
    await reviewCard(card.id, 'good', options);
    const reviewed = (await getCard(card.id))!;
    await updateCard(card.id, { front: 'Q2', back: 'A2', deckId: b.id });
    const moved = (await getCard(card.id))!;
    expect(moved).toMatchObject({ front: 'Q2', back: 'A2', deckId: b.id, due: reviewed.due, state: reviewed.state, reps: 1 });
    expect(moved.rev).toBe(reviewed.rev + 1);
    expect((await listReviewLogs(0)).map((log) => log.deckId)).toEqual([b.id]);
    await updateDeck(b.id, { name: 'Biology', description: ' cells ' });
    expect((await listDecks()).find((d) => d.id === b.id)).toMatchObject({ name: 'Biology', description: 'cells', rev: 2 });
  });

  it('deletes a card with its history, and Undo puts both back exactly', async () => {
    const deck = await createDeck({ name: 'D' });
    const card = await createCard({ deckId: deck.id, front: 'Q', back: 'A' });
    await reviewCard(card.id, 'hard', options);
    const before = (await getCard(card.id))!;
    const deleted = await deleteCard(card.id);
    expect(await getCard(card.id)).toBeUndefined();
    expect(await listReviewLogs(0)).toEqual([]);
    await restoreCard(deleted);
    expect(await getCard(card.id)).toEqual(before);
    expect(await listReviewLogs(0)).toHaveLength(1);
  });

  it('deletes a deck with all its cards and their history, and nothing else', async () => {
    const keep = await createDeck({ name: 'Keep' });
    const drop = await createDeck({ name: 'Drop' });
    const kept = await createCard({ deckId: keep.id, front: 'K', back: '' });
    for (const front of ['1', '2']) {
      const card = await createCard({ deckId: drop.id, front, back: '' });
      await reviewCard(card.id, 'good', options);
    }
    await reviewCard(kept.id, 'easy', options);
    expect(await deleteDeck(drop.id)).toBe(2);
    expect((await listDecks()).map((d) => d.id)).toEqual([keep.id]);
    expect((await listCards()).map((c) => c.id)).toEqual([kept.id]);
    expect((await listReviewLogs(0)).map((l) => l.cardId)).toEqual([kept.id]);
  });
});

describe('reviews', () => {
  it('schedules a new card by the answer: Again in a minute, Good in ten, Easy in days', async () => {
    const deck = await createDeck({ name: 'D' });
    const at = Date.UTC(2026, 10, 17, 9, 0);
    const due: Record<string, number> = {};
    for (const rating of ['again', 'hard', 'good', 'easy'] as const) {
      const card = await createCard({ deckId: deck.id, front: rating, back: '' });
      await reviewCard(card.id, rating, options, at);
      const after = (await getCard(card.id))!;
      due[rating] = after.due - at;
      expect(after).toMatchObject({ reps: 1, lastReview: at, updatedAt: at, rev: 2 });
      expect(after.state).toBe(rating === 'easy' ? 'review' : 'learning');
    }
    expect(due.again).toBe(MINUTE);
    expect(due.good).toBe(10 * MINUTE);
    expect(due.hard!).toBeGreaterThan(due.again!);
    expect(due.hard!).toBeLessThan(due.good!);
    expect(due.easy!).toBeGreaterThanOrEqual(DAY);
  });

  it('logs each answer with the memory from before, and undoes only the latest', async () => {
    const deck = await createDeck({ name: 'D' });
    const card = await createCard({ deckId: deck.id, front: 'Q', back: 'A' });
    const t0 = Date.UTC(2026, 10, 17, 9, 0);
    const first = await reviewCard(card.id, 'good', options, t0);
    const afterFirst = (await getCard(card.id))!;
    const second = await reviewCard(card.id, 'good', options, t0 + 10 * MINUTE);
    expect(first.before).toMatchObject({ state: 'new', reps: 0 });
    expect(second.before).toMatchObject({ state: afterFirst.state, due: afterFirst.due, reps: 1 });

    await rejectsWith(undoReview(first.id), 'not-found');
    const restored = await undoReview(second.id);
    expect(restored).toMatchObject({ state: afterFirst.state, due: afterFirst.due, reps: 1, stability: afterFirst.stability });
    expect((await listReviewLogs(0)).map((l) => l.id)).toEqual([first.id]);
    await undoReview(first.id);
    expect(await getCard(card.id)).toMatchObject({ state: 'new', reps: 0, lastReview: null });
  });

  it('lists the answers given since a time', async () => {
    const deck = await createDeck({ name: 'D' });
    const card = await createCard({ deckId: deck.id, front: 'Q', back: 'A' });
    await reviewCard(card.id, 'again', options, 1000);
    await reviewCard(card.id, 'good', options, 5000);
    expect((await listReviewLogs(2000)).map((l) => l.rating)).toEqual(['good']);
  });
});

describe('flashcards in backups', () => {
  it('round-trips decks, cards and history, and restores them into an empty workspace', async () => {
    const deck = await createDeck({ name: 'Physics', description: 'Mechanics' });
    const card = await createCard({ deckId: deck.id, front: '$F = ma$?', back: 'Newton' });
    await reviewCard(card.id, 'good', options);
    const text = serialiseBackup(await createBackup());
    const file = parseBackup(text);
    expect(file.data.decks).toHaveLength(1);
    expect(file.data.flashcards[0]).toEqual(await getCard(card.id));
    expect(file.data.reviewLogs).toHaveLength(1);

    await db.delete();
    await db.open();
    const report = await restoreBackup(file, 'merge-skip');
    expect(report.added).toBeGreaterThanOrEqual(2);
    expect(await getCard(card.id)).toEqual(file.data.flashcards[0]);
    expect(await listReviewLogs(0)).toHaveLength(1);
  });

  it('reads older backups without study tables as empty', async () => {
    const file = parseBackup(JSON.stringify({ app: 'typenote', formatVersion: 2, schemaVersion: 4, exportedAt: 'x', data: { folders: [], notebooks: [], pages: [], tags: [] } }));
    expect(file.data).toMatchObject({ decks: [], flashcards: [], reviewLogs: [] });
  });

  it('refuses a card outside the backup’s decks, an answer outside its cards, and damaged schedules', async () => {
    const deck = await createDeck({ name: 'D' });
    const card = await createCard({ deckId: deck.id, front: 'Q', back: 'A' });
    await reviewCard(card.id, 'good', options);
    const good = JSON.parse(serialiseBackup(await createBackup())) as { data: Record<string, Record<string, unknown>[]> };
    const broken = (change: (data: Record<string, Record<string, unknown>[]>) => void) => {
      const copy = structuredClone(good);
      change(copy.data);
      return JSON.stringify(copy);
    };
    const refuses = (text: string, detail: string) => {
      const error = (() => {
        try {
          parseBackup(text);
          return null;
        } catch (e) {
          return e;
        }
      })();
      expect(error).toBeInstanceOf(BackupError);
      expect((error as BackupError).detail).toBe(detail);
    };
    refuses(broken((d) => (d.flashcards![0]!.deckId = 'elsewhere')), 'flashcards[0].deckId');
    refuses(broken((d) => (d.reviewLogs![0]!.cardId = 'elsewhere')), 'reviewLogs[0].cardId');
    refuses(broken((d) => (d.flashcards![0]!.state = 'forgotten')), 'flashcards[0].state');
    refuses(broken((d) => (d.flashcards![0]!.difficulty = 11)), 'flashcards[0].difficulty');
    refuses(broken((d) => (d.flashcards![0]!.reps = 1.5)), 'flashcards[0].reps');
    refuses(broken((d) => (d.flashcards![0]!.front = '  ')), 'flashcards[0].front');
    refuses(broken((d) => (d.reviewLogs![0]!.rating = 'perfect')), 'reviewLogs[0].rating');
  });
});

describe('schema version 5', () => {
  it('opens a version 4 database with its content intact and empty study tables', async () => {
    const name = 'typenote-migration-v5-test';
    await Dexie.delete(name);
    const old = new Dexie(name);
    // The released schemas, as they shipped.
    old.version(1).stores({
      folders: 'id, parentId, trashBatchId',
      notebooks: 'id, folderId, *tagIds, trashBatchId',
      pages: 'id, notebookId, folderId, *tagIds, updatedAt, trashBatchId',
      tags: 'id',
      settings: 'key',
      snapshots: 'id, createdAt',
    });
    old.version(2).stores({ drawings: 'id, pageId' });
    old.version(3).stores({ writingDays: 'date' });
    old.version(4).stores({ attachments: 'id, kind', attachmentData: 'id', annotations: 'id, attachmentId' });
    await old.table('pages').add({ id: 'p1', title: 'Kept', notebookId: null, folderId: null, content: { type: 'doc', content: [] }, plainText: 'Notes', tagIds: [], deletedAt: null, trashBatchId: null });
    await old.table('attachments').add({ id: 'a1', kind: 'pdf', name: 'Paper', mimeType: 'application/pdf', size: 3 });
    old.close();

    const upgraded = new TypeNoteDB(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(5);
    expect(await upgraded.pages.get('p1')).toMatchObject({ title: 'Kept' });
    expect(await upgraded.attachments.get('a1')).toMatchObject({ name: 'Paper' });
    expect(await upgraded.decks.count()).toBe(0);
    expect(await upgraded.flashcards.count()).toBe(0);
    expect(await upgraded.reviewLogs.count()).toBe(0);
    upgraded.close();
    await Dexie.delete(name);
  });
});
