import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type SaveStatus, createAutosaver } from './autosave';

/** A write whose completion the test controls. */
function deferredWrite() {
  const calls: { value: string; resolve: () => void; reject: (e: Error) => void }[] = [];
  const write = vi.fn(
    (value: string) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ value, resolve, reject });
      }),
  );
  return { write, calls };
}

const states = (log: SaveStatus[]) => log.map((s) => s.state);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('autosave', () => {
  it('debounces typing and writes only the latest value', async () => {
    const { write, calls } = deferredWrite();
    const saver = createAutosaver(write, () => {}, 800);
    saver.schedule('a');
    saver.schedule('ab');
    saver.schedule('abc');
    await vi.advanceTimersByTimeAsync(799);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(calls[0]?.value).toBe('abc');
  });

  it('reports "saved" only after the write has completed', async () => {
    const { write, calls } = deferredWrite();
    const log: SaveStatus[] = [];
    const saver = createAutosaver(write, (s) => log.push(s), 800);
    saver.schedule('text');
    await vi.advanceTimersByTimeAsync(800);
    expect(states(log)).toEqual(['pending', 'saving']);
    expect(saver.isDirty()).toBe(true);
    calls[0]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(states(log)).toEqual(['pending', 'saving', 'saved']);
    expect(log.at(-1)?.savedAt).not.toBeNull();
    expect(saver.isDirty()).toBe(false);
  });

  it('never runs two writes at once, and saves edits made during a write', async () => {
    const { write, calls } = deferredWrite();
    const log: SaveStatus[] = [];
    const saver = createAutosaver(write, (s) => log.push(s), 800);
    saver.schedule('first');
    await vi.advanceTimersByTimeAsync(800);
    saver.schedule('second');
    await vi.advanceTimersByTimeAsync(800);
    expect(write).toHaveBeenCalledTimes(1);
    calls[0]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(2);
    expect(calls[1]?.value).toBe('second');
    // The first write finishing is not "saved": a newer edit is still unwritten.
    expect(states(log)).not.toContain('saved');
    calls[1]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(log.at(-1)?.state).toBe('saved');
  });

  it('keeps the value after a failed write and retries it on flush', async () => {
    const { write, calls } = deferredWrite();
    const log: SaveStatus[] = [];
    const saver = createAutosaver(write, (s) => log.push(s), 800);
    saver.schedule('precious');
    await vi.advanceTimersByTimeAsync(800);
    calls[0]!.reject(new Error('quota'));
    await vi.advanceTimersByTimeAsync(0);
    expect(log.at(-1)).toMatchObject({ state: 'failed', savedAt: null });
    expect(saver.isDirty()).toBe(true);

    const retry = saver.flush();
    expect(calls[1]?.value).toBe('precious');
    calls[1]!.resolve();
    await retry;
    expect(log.at(-1)?.state).toBe('saved');
    expect(saver.isDirty()).toBe(false);
  });

  it('flush writes immediately, without waiting for the delay', async () => {
    const { write, calls } = deferredWrite();
    const saver = createAutosaver(write, () => {}, 800);
    saver.schedule('now');
    void saver.flush();
    expect(write).toHaveBeenCalledTimes(1);
    calls[0]!.resolve();
    await vi.advanceTimersByTimeAsync(800);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('writes outstanding text on dispose and then stays quiet', async () => {
    const { write, calls } = deferredWrite();
    const log: SaveStatus[] = [];
    const saver = createAutosaver(write, (s) => log.push(s), 800);
    saver.schedule('leaving the page');
    saver.dispose();
    expect(calls[0]?.value).toBe('leaving the page');
    calls[0]!.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(states(log)).toEqual(['pending']);
  });
});
