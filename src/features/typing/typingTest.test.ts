import { describe, expect, it } from 'vitest';
import type { Page } from '@/types/models';
import { BUILTIN_PASSAGES, PASSAGE_WORDS, charStates, choosePassage, cleanForTyping, countInput, score } from './typingTest';

const page = (id: string, notebookId: string | null, plainText: string): Page => ({
  id,
  createdAt: 1,
  updatedAt: 1,
  rev: 1,
  deletedAt: null,
  trashBatchId: null,
  title: id,
  notebookId,
  content: { type: 'doc' },
  plainText,
  layout: 'continuous',
  favourite: false,
  pinned: false,
  order: 1,
  lastOpenedAt: null,
});

/** The same "random" numbers every run. */
const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const chemistry = 'Atoms bond to form molecules. Ionic bonds transfer electrons between atoms. Covalent bonds share electron pairs. Metallic bonds hold a sea of electrons.';
const history = 'The printing press spread books across Europe. Gutenberg used movable type around 1440. Prices fell and more people learned to read.';

describe('choosing a passage', () => {
  it('takes words from the notes of the chosen notebook only', () => {
    const pages = [page('p1', 'chem', chemistry), page('p2', 'hist', history)];
    const passage = choosePassage({ source: 'notes', notebookId: 'chem' }, pages, seeded());
    expect(passage.fellBack).toBe(false);
    const words = passage.text.split(' ');
    expect(words).toHaveLength(PASSAGE_WORDS);
    const allowed = new Set(chemistry.split(' '));
    for (const word of words) expect(allowed.has(word)).toBe(true);
  });

  it('starts at the beginning of a sentence', () => {
    const pages = [page('p1', 'chem', chemistry)];
    for (let seed = 1; seed <= 40; seed++) {
      const { text } = choosePassage({ source: 'notes', notebookId: null }, pages, seeded(seed));
      expect(text).toMatch(/^(Atoms|Ionic|Covalent|Metallic) /);
    }
  });

  it('falls back to the built-in passages when no note is long enough', () => {
    const passage = choosePassage({ source: 'notes', notebookId: null }, [page('p1', null, 'Too short.')], seeded());
    expect(passage.fellBack).toBe(true);
    const builtin = new Set(BUILTIN_PASSAGES.join(' ').split(' '));
    for (const word of passage.text.split(' ')) expect(builtin.has(word)).toBe(true);
  });

  it('gives built-in passages long enough for a minute of fast typing', () => {
    const passage = choosePassage({ source: 'builtin', notebookId: null }, [], seeded(7));
    expect(passage.text.split(' ')).toHaveLength(PASSAGE_WORDS);
  });

  it('makes text easy to type: one line, plain quotes and dashes', () => {
    expect(cleanForTyping('“Quoted”\n\n— and it’s  done…')).toBe('"Quoted" - and it\'s done...');
  });
});

describe('scoring', () => {
  it('marks each letter right, wrong or still to type', () => {
    expect(charStates('cat', 'cut')).toEqual(['correct', 'wrong', 'correct']);
    expect(charStates('cat', 'c')).toEqual(['correct', 'pending', 'pending']);
  });

  it('counts mistakes when they are typed, even after they are fixed', () => {
    const target = 'the cat';
    let keys = countInput(target, '', 't', { total: 0, wrong: 0 });
    keys = countInput(target, 't', 'tx', keys); // wrong
    keys = countInput(target, 'tx', 't', keys); // deleted: not a keystroke counted
    keys = countInput(target, 't', 'th', keys);
    expect(keys).toEqual({ total: 3, wrong: 1 });
  });

  it('gives words per minute from correct letters, five to a word, and accuracy from keystrokes', () => {
    const target = 'aaaaa bbbbb ccccc';
    // 15 right letters out of 15 typed, in 30 seconds: 3 words in half a minute.
    const result = score(target, 'aaaaa bbbbb ccc', { total: 15, wrong: 0 }, 30_000);
    expect(result).toMatchObject({ wpm: 6, rawWpm: 6, accuracy: 100, correct: 15, wrong: 0, seconds: 30 });
    const sloppy = score(target, 'aaaab', { total: 10, wrong: 5 }, 60_000);
    expect(sloppy).toMatchObject({ correct: 4, wrong: 1, accuracy: 50, wpm: 1, rawWpm: 1 });
  });
});
