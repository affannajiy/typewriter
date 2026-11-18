import type { Id, Page } from '@/types/models';

/**
 * The typing test, without any interface: choosing the text to type, and
 * scoring what was typed. Nothing here is stored.
 */

export const DURATIONS = [15, 30, 60] as const;
export type Duration = (typeof DURATIONS)[number];

export type TextSource = 'notes' | 'builtin';

/** Words in a passage: more than anyone types in a minute, so the text never runs out. */
export const PASSAGE_WORDS = 160;
/** A page needs this many words to give a passage. */
const MIN_PAGE_WORDS = 12;

/**
 * Passages written for TypeNote, used when there are no notes to type, or
 * when the writer chooses them. Plain words and punctuation found on every keyboard.
 */
export const BUILTIN_PASSAGES = [
  'The ribbon was new and the paper was crisp, so every letter landed dark and clean. She typed slowly at first, listening to each key strike the platen, then faster as the sentence found its rhythm.',
  'A good note is short enough to read in a glance and long enough to make sense a month later. Write the idea, then the reason, then one example. Leave the rest for the page after.',
  'Rain tapped on the window in time with the keys. By the end of the hour the stack of pages had grown taller than the cup of tea beside it, and the tea had gone cold.',
  'Learning works best in small pieces. Read a little, close the book, and write down what you remember in your own words. The gaps you find are the parts worth reading again.',
  'At the end of each line a small bell rang, and he pushed the carriage back with a practised sweep of the hand. Nobody had told him to love the sound, but he did.',
  'Every notebook starts empty, and that is the best part. The first page can hold anything: a list of questions, a drawing of a cell, a formula copied from the board, or a single good sentence.',
  'Typing is a skill of the hands more than the eyes. Keep your fingers resting on the home row, look at the words rather than the keys, and let accuracy come before speed.',
  'The library was quiet except for the turning of pages. Outside, the evening light moved slowly across the desks, and one by one the lamps came on along the long wooden tables.',
  'When an idea arrives, catch it before it leaves. A notepad by the bed, a page open on the screen, a pencil behind the ear: the tool matters less than the habit of writing it down.',
  'Old machines were built to last. Their keys were heavy and their frames were steel, and with a little oil and a fresh ribbon many of them still type as well today as they ever did.',
] as const;

const words = (text: string) => text.split(/\s+/u).filter(Boolean);

/** One line of plain words: no line breaks, no runs of spaces, no characters most keyboards lack. */
export function cleanForTyping(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[‘’]/gu, "'")
    .replace(/[“”]/gu, '"')
    .replace(/[–—]/gu, '-')
    .replace(/…/gu, '...')
    .replace(/[^\p{L}\p{N}\p{P}\p{Zs}$+<=>^`|~]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** A number from 0 up to, not including, 1, as Math.random gives. Tests pass their own. */
type Random = () => number;
const pick = <T,>(items: readonly T[], random: Random): T => items[Math.floor(random() * items.length)]!;

/** Built-in passages, one after another in a random order, until the passage is long enough. */
function builtinPassage(random: Random): string {
  const out: string[] = [];
  let last = '';
  while (out.length < PASSAGE_WORDS) {
    let next = pick(BUILTIN_PASSAGES, random);
    if (next === last && BUILTIN_PASSAGES.length > 1) next = BUILTIN_PASSAGES[(BUILTIN_PASSAGES.indexOf(next) + 1) % BUILTIN_PASSAGES.length]!;
    last = next;
    out.push(...words(next));
  }
  return out.slice(0, PASSAGE_WORDS).join(' ');
}

/**
 * Text from the writer's own pages: a run of words from a random page,
 * starting at the beginning of a sentence where it can, then from other
 * pages until the passage is long enough. Retyping notes is also revision.
 */
function notesPassage(pages: Page[], random: Random): string | null {
  const usable = pages.map((page) => words(cleanForTyping(page.plainText))).filter((list) => list.length >= MIN_PAGE_WORDS);
  if (usable.length === 0) return null;
  const out: string[] = [];
  const order = [...usable].sort(() => random() - 0.5);
  for (let round = 0; out.length < PASSAGE_WORDS && round < 50; round++) {
    const list = order[round % order.length]!;
    let start = Math.floor(random() * Math.max(1, list.length - MIN_PAGE_WORDS));
    // Back up to the start of the sentence, if there is one close by. The page's first word starts one.
    for (let back = start; back >= Math.max(0, start - 30); back--) {
      if (back === 0 || /[.!?]$/u.test(list[back - 1]!)) {
        start = back;
        break;
      }
    }
    out.push(...list.slice(start, start + (PASSAGE_WORDS - out.length)));
  }
  return out.slice(0, PASSAGE_WORDS).join(' ');
}

export interface PassageChoice {
  source: TextSource;
  /** Only pages of this notebook, or null for every page. */
  notebookId: Id | null;
}

export interface Passage {
  text: string;
  /** True when notes were asked for but there were none long enough: the built-in passages stand in. */
  fellBack: boolean;
}

export function choosePassage(choice: PassageChoice, pages: Page[], random: Random = Math.random): Passage {
  if (choice.source === 'notes') {
    const from = choice.notebookId === null ? pages : pages.filter((page) => page.notebookId === choice.notebookId);
    const text = notesPassage(from, random);
    if (text) return { text, fellBack: false };
    return { text: builtinPassage(random), fellBack: true };
  }
  return { text: builtinPassage(random), fellBack: false };
}

/** How each typed character compares with the passage. */
export type CharState = 'correct' | 'wrong' | 'pending';

export function charStates(target: string, typed: string): CharState[] {
  return Array.from(target, (char, i) => (i >= typed.length ? 'pending' : typed[i] === char ? 'correct' : 'wrong'));
}

export interface Keystrokes {
  /** Characters typed, including those later deleted. */
  total: number;
  /** Of those, the ones that did not match the passage when typed. */
  wrong: number;
}

/** Counts one input: the characters it added and how many of them were wrong. */
export function countInput(target: string, before: string, after: string, keys: Keystrokes): Keystrokes {
  if (after.length <= before.length) return keys;
  let wrong = 0;
  for (let i = before.length; i < after.length; i++) if (after[i] !== target[i]) wrong++;
  return { total: keys.total + (after.length - before.length), wrong: keys.wrong + wrong };
}

export interface Score {
  /** Words per minute: correct characters, five to a word. */
  wpm: number;
  /** Words per minute counting every character, right or wrong. */
  rawWpm: number;
  /** Keystrokes that were right when typed, in percent. */
  accuracy: number;
  correct: number;
  wrong: number;
  seconds: number;
}

export function score(target: string, typed: string, keys: Keystrokes, elapsedMs: number): Score {
  const states = charStates(target, typed);
  const correct = states.filter((s) => s === 'correct').length;
  const wrong = states.filter((s) => s === 'wrong').length;
  const minutes = Math.max(elapsedMs, 1) / 60_000;
  return {
    wpm: Math.round(correct / 5 / minutes),
    rawWpm: Math.round(typed.length / 5 / minutes),
    accuracy: keys.total === 0 ? 100 : Math.round(((keys.total - keys.wrong) / keys.total) * 100),
    correct,
    wrong,
    seconds: Math.round(elapsedMs / 1000),
  };
}
