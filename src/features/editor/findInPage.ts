import { Extension } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import { type EditorState, Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { findMatches, queryWords } from '@/features/search/search';

/**
 * Find in the open page: every match of the query's words is highlighted,
 * and one of them is "current". The words and the current match live in
 * plugin state, so the highlights follow the text while the writer edits.
 * Nothing here changes the document or the selection.
 */

export interface FindMatch {
  from: number;
  to: number;
}

interface FindState {
  words: string[];
  matches: FindMatch[];
  current: number;
  decorations: DecorationSet;
}

type FindMeta = { words: string[] } | { current: number };

export const findKey = new PluginKey<FindState>('findInPage');

/** Every match in the document, in order. Text in one block is searched as one line; other nodes break it. */
export function findInDoc(doc: PmNode, words: string[]): FindMatch[] {
  if (words.length === 0) return [];
  const out: FindMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    const at: number[] = [];
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) at.push(start + i);
        text += child.text;
      } else {
        // An equation or a line break: a separator no word can match across.
        at.push(start);
        text += '\u0000';
      }
    });
    for (const [a, b] of findMatches(text, words)) out.push({ from: at[a]!, to: at[b - 1]! + 1 });
    return false;
  });
  return out;
}

function decorate(doc: PmNode, matches: FindMatch[], current: number): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    matches.map((match, index) => Decoration.inline(match.from, match.to, { class: index === current ? 'tn-find-match tn-find-current' : 'tn-find-match' })),
  );
}

const empty: FindState = { words: [], matches: [], current: 0, decorations: DecorationSet.empty };

export const FindInPage = Extension.create({
  name: 'findInPage',
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => empty,
          apply(tr: Transaction, old: FindState): FindState {
            const meta = tr.getMeta(findKey) as FindMeta | undefined;
            if (meta && 'words' in meta) {
              const matches = findInDoc(tr.doc, meta.words);
              return { words: meta.words, matches, current: 0, decorations: decorate(tr.doc, matches, 0) };
            }
            if (meta && 'current' in meta) {
              const current = old.matches.length === 0 ? 0 : (meta.current + old.matches.length) % old.matches.length;
              return { ...old, current, decorations: decorate(tr.doc, old.matches, current) };
            }
            if (tr.docChanged && old.words.length > 0) {
              const matches = findInDoc(tr.doc, old.words);
              const current = Math.min(old.current, Math.max(matches.length - 1, 0));
              return { ...old, matches, current, decorations: decorate(tr.doc, matches, current) };
            }
            return old;
          },
        },
        props: {
          decorations: (state: EditorState) => findKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});

export const findState = (state: EditorState): FindState => findKey.getState(state) ?? empty;

/** A transaction that sets what to find. Not part of undo history. */
export const setFindQuery = (state: EditorState, query: string): Transaction =>
  state.tr.setMeta(findKey, { words: queryWords(query) } satisfies FindMeta).setMeta('addToHistory', false);

/** A transaction that moves to another match: +1 the next, -1 the previous. It wraps around. */
export const stepFind = (state: EditorState, by: number): Transaction =>
  state.tr.setMeta(findKey, { current: findState(state).current + by } satisfies FindMeta).setMeta('addToHistory', false);
