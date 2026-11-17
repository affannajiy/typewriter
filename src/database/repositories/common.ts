import type { Trashable, Versioned } from '@/types/models';

export const newId = (): string => crypto.randomUUID();
export const now = (): number => Date.now();

/** Fields every new entity starts with. */
export function freshVersion(): Versioned {
  const time = now();
  return { id: newId(), createdAt: time, updatedAt: time, rev: 1 };
}

export const notTrashed: Trashable = { deletedAt: null, trashBatchId: null };

/** The change set for a normal edit: new timestamp, next revision. */
export function bump<T extends Versioned>(current: T, patch: Partial<T>): Partial<T> {
  return { ...patch, updatedAt: now(), rev: current.rev + 1 };
}

export const isLive = (entity: Trashable): boolean => entity.deletedAt === null;

export const byOrder = (a: { order: number }, b: { order: number }): number => a.order - b.order;

/** Order value that puts a new item after its siblings. */
export function orderAfter(siblings: { order: number }[]): number {
  return siblings.reduce((max, s) => Math.max(max, s.order), 0) + 1;
}

export const MAX_NAME_LENGTH = 200;

/** Trim and bound a user-typed name. An empty name becomes the fallback. */
export function cleanName(raw: string, fallback: string): string {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  return name === '' ? fallback : name;
}

export type RepositoryErrorCode = 'not-found' | 'invalid-move' | 'invalid-colour' | 'invalid-file' | 'file-too-large' | 'file-in-use' | 'invalid-card';

/** An expected failure the interface can explain to the user. */
export class RepositoryError extends Error {
  constructor(
    readonly code: RepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export function found<T>(entity: T | undefined, what: string): T {
  if (entity === undefined) throw new RepositoryError('not-found', `${what} not found`);
  return entity;
}
