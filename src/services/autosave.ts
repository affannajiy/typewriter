/**
 * Autosave.
 *
 * Writes are debounced and run one at a time; the newest value always wins.
 * The status becomes "saved" only after the write promise resolves, which for
 * a repository call means IndexedDB has committed the transaction.
 * A failed write keeps its value, so flush() retries it. Nothing is dropped.
 */

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'failed';

export interface SaveStatus {
  state: SaveState;
  savedAt: number | null;
  error: unknown;
}

export interface Autosaver<T> {
  /** Queue a value to be written after the debounce delay. */
  schedule(value: T): void;
  /** Write now. Also retries a failed write. Resolves when the queue is empty or a write fails. */
  flush(): Promise<void>;
  /** True while a value is waiting, being written, or has failed to write. */
  isDirty(): boolean;
  /** Write anything outstanding and stop reporting status. */
  dispose(): void;
}

export const AUTOSAVE_DELAY_MS = 800;

export function createAutosaver<T>(
  write: (value: T) => Promise<void>,
  onStatus: (status: SaveStatus) => void,
  delayMs = AUTOSAVE_DELAY_MS,
): Autosaver<T> {
  let pending: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | null = null;
  let savedAt: number | null = null;
  let disposed = false;

  const emit = (state: SaveState, error: unknown = null) => {
    if (!disposed) onStatus({ state, savedAt, error });
  };

  const drain = (): Promise<void> => {
    if (running) return running;
    running = (async () => {
      while (pending) {
        const job = pending;
        pending = null;
        emit('saving');
        try {
          await write(job.value);
          savedAt = Date.now();
          if (!pending) emit('saved');
        } catch (error) {
          // Keep the unsaved value unless a newer one arrived meanwhile.
          pending ??= job;
          emit('failed', error);
          return;
        }
      }
    })().finally(() => {
      running = null;
    });
    return running;
  };

  return {
    schedule(value) {
      pending = { value };
      emit('pending');
      clearTimeout(timer);
      timer = setTimeout(() => void drain(), delayMs);
    },
    flush() {
      clearTimeout(timer);
      return drain();
    },
    isDirty: () => pending !== null || running !== null,
    dispose() {
      clearTimeout(timer);
      disposed = true;
      void drain();
    },
  };
}
