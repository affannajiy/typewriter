import { Node, mergeAttributes } from '@tiptap/core';
import { NodeSelection, PluginKey } from '@tiptap/pm/state';
import { type ReactNodeViewProps, ReactNodeViewRenderer } from '@tiptap/react';
import { Suggestion, type SuggestionProps } from '@tiptap/suggestion';
import type { ComponentType } from 'react';
import type { Id } from '@/types/models';
import { type LinkTarget, PAGE_LINK_TYPE } from './links';

/**
 * A link to another page, typed as "[[" and a few letters of its title.
 * The node holds the page's ID and, as a fallback, the title it had when the
 * link was made; the link shows the page's current title.
 */

export type LinkChoice = { kind: 'page'; target: LinkTarget } | { kind: 'create'; title: string };

/** What the link menu shows. Null when it is closed. */
export interface LinkMenuState {
  items: LinkChoice[];
  rect: DOMRect | null;
  choose: (choice: LinkChoice) => void;
}

export interface PageLinkOptions {
  view: ComponentType<ReactNodeViewProps> | null;
  /** Pages to offer for a query. */
  findTargets: (query: string) => LinkTarget[];
  /** Makes a new page with this title and returns its ID. Null: the menu offers no "create". */
  createPage: ((title: string) => Promise<Id>) | null;
  onMenu: (state: LinkMenuState | null) => void;
  /** Returns true when the menu used the key. */
  onMenuKey: (event: KeyboardEvent) => boolean;
  /** Opens the page. By default, through the app's hash route. */
  onOpen: (pageId: Id) => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageLink: {
      /** Types "[[" at the selection, which opens the link menu. */
      startPageLink: () => ReturnType;
    };
  }
}

export const openPageRoute = (pageId: Id) => {
  window.location.hash = `#/page/${pageId}`;
};

const MAX_TITLE = 200;

export const PageLink = Node.create<PageLinkOptions>({
  name: PAGE_LINK_TYPE,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
      view: null,
      findTargets: () => [],
      createPage: null,
      onMenu: () => {},
      onMenuKey: () => false,
      onOpen: openPageRoute,
    };
  },

  addAttributes() {
    return {
      pageId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-page-id'),
        renderHTML: (attributes) => (attributes.pageId ? { 'data-page-id': attributes.pageId as string } : {}),
      },
      title: {
        default: '',
        parseHTML: (element) => element.textContent ?? '',
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'a[data-type="page-link"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, { 'data-type': 'page-link', href: `#/page/${String(node.attrs.pageId)}` }), String(node.attrs.title)];
  },

  renderText({ node }) {
    return String(node.attrs.title);
  },

  addNodeView() {
    const { view } = this.options;
    return view ? ReactNodeViewRenderer(view, { as: 'span' }) : null;
  },

  addCommands() {
    return {
      startPageLink:
        () =>
        ({ commands }) =>
          commands.insertContent('[['),
    };
  },

  addKeyboardShortcuts() {
    return {
      // Enter on a selected link follows it.
      Enter: ({ editor }) => {
        const { selection } = editor.state;
        if (!(selection instanceof NodeSelection) || selection.node.type.name !== this.name) return false;
        const id: unknown = selection.node.attrs.pageId;
        if (typeof id !== 'string' || id === '') return false;
        this.options.onOpen(id);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const type = this.type;
    const toState = (props: SuggestionProps<LinkChoice, LinkChoice>): LinkMenuState => ({
      items: props.items,
      rect: props.clientRect?.() ?? null,
      choose: (choice) => props.command(choice),
    });
    return [
      Suggestion<LinkChoice, LinkChoice>({
        editor: this.editor,
        pluginKey: new PluginKey('pageLinkMenu'),
        char: '[[',
        allowSpaces: true,
        allowedPrefixes: null,
        // Code is typed literally.
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          return !$from.parent.type.spec.code && !$from.marks().some((mark) => mark.type.spec.code);
        },
        items: ({ query }) => {
          const title = query.replace(/\]+$/, '').trim().slice(0, MAX_TITLE);
          const pages: LinkChoice[] = options.findTargets(title).map((target) => ({ kind: 'page', target }));
          const exact = pages.some((choice) => choice.kind === 'page' && choice.target.title.toLowerCase() === title.toLowerCase());
          return title !== '' && options.createPage && !exact ? [...pages, { kind: 'create', title }] : pages;
        },
        command: ({ editor, range, props: choice }) => {
          const insert = (pageId: Id, title: string) => {
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                { type: type.name, attrs: { pageId, title } },
                { type: 'text', text: ' ' },
              ])
              .run();
          };
          if (choice.kind === 'page') {
            insert(choice.target.id, choice.target.title);
            return;
          }
          const create = options.createPage;
          if (!create) return;
          // The typed "[[title" goes now; the link arrives at the caret once the page exists.
          editor.chain().focus().deleteRange(range).run();
          void create(choice.title).then(
            (pageId) => {
              if (editor.isDestroyed) return;
              editor
                .chain()
                .focus()
                .insertContent([
                  { type: type.name, attrs: { pageId, title: choice.title } },
                  { type: 'text', text: ' ' },
                ])
                .run();
            },
            (error: unknown) => console.error(error),
          );
        },
        render: () => ({
          onStart: (props) => options.onMenu(toState(props)),
          onUpdate: (props) => options.onMenu(toState(props)),
          onKeyDown: ({ event }) => options.onMenuKey(event),
          onExit: () => options.onMenu(null),
        }),
      }),
    ];
  },
});
