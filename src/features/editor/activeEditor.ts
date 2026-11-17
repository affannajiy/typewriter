import type { Editor } from '@tiptap/core';
import { useSyncExternalStore } from 'react';

/**
 * The editor of the page that is open, if any. The command palette lives in
 * the application shell, outside the page screen, and reads it from here to
 * offer formatting commands.
 */

let active: Editor | null = null;
const listeners = new Set<() => void>();

export function setActiveEditor(editor: Editor | null): void {
  active = editor;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The open page's editor, read once, outside React rendering. */
export const getActiveEditor = (): Editor | null => active;

export const useActiveEditor = (): Editor | null => useSyncExternalStore(subscribe, () => active);
