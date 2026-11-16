/**
 * Core data model. See DATA_MODEL.md.
 *
 * Every entity has a stable ID, timestamps (epoch milliseconds) and a revision
 * counter, so a future opt-in sync can detect conflicts. Deletion is soft:
 * `deletedAt` is set and the row stays until the user empties the Trash.
 */

export type Id = string;

export interface Versioned {
  id: Id;
  createdAt: number;
  updatedAt: number;
  /** Incremented on every write. */
  rev: number;
}

export interface Trashable {
  deletedAt: number | null;
  /** All items trashed by one user action share a batch, so they restore together. */
  trashBatchId: Id | null;
}

export interface Folder extends Versioned, Trashable {
  name: string;
  /** Parent folder, or null at the top level of the workspace. */
  parentId: Id | null;
  order: number;
}

/** How a cover is finished. `solid` is plain cloth; the others are a pattern pressed into it. */
export const COVER_KINDS = ['solid', 'linen', 'stripes', 'dots', 'grid'] as const;
export type CoverKind = (typeof COVER_KINDS)[number];

export interface NotebookCover {
  kind: CoverKind;
  colour: string;
}

/** Icons a notebook can carry on its cover and in lists. Names, not images: the interface draws them. */
export const NOTEBOOK_ICONS = ['book', 'feather', 'flask', 'calculator', 'globe', 'music', 'palette', 'leaf', 'heart', 'star', 'code', 'compass'] as const;
export type NotebookIcon = (typeof NOTEBOOK_ICONS)[number];

export interface Notebook extends Versioned, Trashable {
  name: string;
  description: string;
  folderId: Id | null;
  cover: NotebookCover;
  /** Since schema version 3. Null: no icon. */
  icon: NotebookIcon | null;
  tagIds: Id[];
  favourite: boolean;
  order: number;
}

/** A ProseMirror/Tiptap-compatible document node. */
export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export type PageLayout = 'continuous' | 'paginated';

export interface Page extends Versioned, Trashable {
  title: string;
  /**
   * Canonical location: a notebook, a folder, or the top level (both null).
   * At most one of the two is set.
   */
  notebookId: Id | null;
  folderId: Id | null;
  /** Source of truth for the page body. */
  content: DocNode;
  /** Derived from `content` on every save. Used for search and previews. */
  plainText: string;
  layout: PageLayout;
  tagIds: Id[];
  favourite: boolean;
  pinned: boolean;
  order: number;
  lastOpenedAt: number | null;
}

export interface Tag extends Versioned {
  name: string;
  colour: string;
}

/**
 * Words written on one calendar day, on this device. Since schema version 3.
 * A save that makes a page longer adds the difference; deleting never subtracts.
 */
export interface WritingDay {
  /** Local calendar day, `YYYY-MM-DD`. The key. */
  date: string;
  words: number;
  updatedAt: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
  updatedAt: number;
}

/** A copy of the workspace taken automatically before a destructive restore. */
export interface SafetySnapshot {
  id: Id;
  createdAt: number;
  payload: string;
}

export type ItemKind = 'folder' | 'notebook' | 'page';

export interface ItemRef {
  kind: ItemKind;
  id: Id;
}

/** Where a page can live. Both null means the top level. */
export interface PageLocation {
  notebookId: Id | null;
  folderId: Id | null;
}

/** Ink colours are names, not values: each theme shows them in a shade that reads on its paper. */
export const INK_COLOURS = ['ink', 'red', 'blue', 'green', 'yellow'] as const;
export type InkColour = (typeof INK_COLOURS)[number];

export const DRAW_TOOLS = ['pen', 'highlighter'] as const;
export type DrawTool = (typeof DRAW_TOOLS)[number];

/** One line drawn without lifting the pen. */
export interface Stroke {
  id: Id;
  tool: DrawTool;
  colour: InkColour;
  /** Base width in canvas units. */
  size: number;
  /** True when drawn with a stylus that reports real pressure. Otherwise pressure is simulated from speed. */
  pen: boolean;
  /** Flat list of x, y, pressure triples, in canvas units. Pressure is 0 to 1. */
  points: number[];
}

/**
 * A drawing in a page. The page's document holds a `drawing` block with this
 * ID; the strokes live here, so typing in the page never rewrites them.
 */
export interface Drawing extends Versioned {
  /** The page whose document holds the drawing. Permanently deleting the page deletes it. */
  pageId: Id;
  /** Size of the canvas in canvas units. The width is fixed; the height grows on request. */
  width: number;
  height: number;
  strokes: Stroke[];
}
