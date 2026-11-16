import { SCHEMA_VERSION } from '@/database/db';
import { MAX_NAME_LENGTH } from '@/database/repositories/common';
import { SETTING_KEYS, isValidSetting } from '@/features/settings/model';
import { DRAW_TOOLS, type DocNode, type Drawing, type Folder, INK_COLOURS, type Notebook, type Page, type SettingRecord, type Stroke, type Tag } from '@/types/models';
import { isHexColour } from '@/utils/colour';

/**
 * Backup file format and its validation.
 *
 * A backup file is untrusted input. Every record is rebuilt field by field
 * from an allowlist: unknown fields are dropped, a wrong type rejects the
 * whole file, and nothing is repaired silently.
 */

export const BACKUP_FORMAT_VERSION = 1;
export const MAX_BACKUP_BYTES = 200 * 1024 * 1024;

export interface BackupData {
  folders: Folder[];
  notebooks: Notebook[];
  pages: Page[];
  tags: Tag[];
  settings: SettingRecord[];
  /** Missing from files written before schema version 2; read as empty. */
  drawings: Drawing[];
}

export interface BackupFile {
  app: 'typenote';
  formatVersion: number;
  schemaVersion: number;
  exportedAt: string;
  data: BackupData;
}

export type BackupErrorCode = 'too-large' | 'not-json' | 'not-typenote' | 'newer-version' | 'invalid-record' | 'duplicate-id';

export class BackupError extends Error {
  constructor(
    readonly code: BackupErrorCode,
    /** Where in the file the problem is, for example "pages[3].title". */
    readonly detail = '',
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'BackupError';
  }
}

type Raw = Record<string, unknown>;

const MAX_DOC_DEPTH = 100;
const MAX_TEXT = 5_000_000;

const fail = (path: string): never => {
  throw new BackupError('invalid-record', path);
};

const isRecord = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

function obj(v: unknown, path: string): Raw {
  return isRecord(v) ? v : fail(path);
}
function str(v: unknown, path: string, max = MAX_NAME_LENGTH): string {
  return typeof v === 'string' && v.length <= max ? v : fail(path);
}
function id(v: unknown, path: string): string {
  const value = str(v, path, 100);
  return value.length > 0 ? value : fail(path);
}
function nullableId(v: unknown, path: string): string | null {
  return v === null ? null : id(v, path);
}
function num(v: unknown, path: string): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fail(path);
}
function nullableNum(v: unknown, path: string): number | null {
  return v === null ? null : num(v, path);
}
function bool(v: unknown, path: string): boolean {
  return typeof v === 'boolean' ? v : fail(path);
}
function colour(v: unknown, path: string): string {
  return isHexColour(v) ? v.toLowerCase() : fail(path);
}
function idList(v: unknown, path: string): string[] {
  if (!Array.isArray(v) || v.length > 500) return fail(path);
  return v.map((item, i) => id(item, `${path}[${i}]`));
}
function list(v: unknown, path: string): unknown[] {
  return Array.isArray(v) ? v : fail(path);
}

function versioned(r: Raw, path: string) {
  return {
    id: id(r.id, `${path}.id`),
    createdAt: num(r.createdAt, `${path}.createdAt`),
    updatedAt: num(r.updatedAt, `${path}.updatedAt`),
    rev: num(r.rev, `${path}.rev`),
  };
}

function trashable(r: Raw, path: string) {
  return {
    deletedAt: nullableNum(r.deletedAt, `${path}.deletedAt`),
    trashBatchId: nullableId(r.trashBatchId, `${path}.trashBatchId`),
  };
}

/** Attribute and mark values must be plain JSON. Depth is capped. */
function jsonValue(v: unknown, path: string, depth: number): unknown {
  if (depth > MAX_DOC_DEPTH) return fail(path);
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : fail(path);
  if (Array.isArray(v)) return v.map((item, i) => jsonValue(item, `${path}[${i}]`, depth + 1));
  if (isRecord(v)) return attrs(v, path, depth + 1);
  return fail(path);
}

function attrs(v: Raw, path: string, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(v)) {
    // Keys that could reach the object prototype are never copied.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') fail(`${path}.${key}`);
    out[key] = jsonValue(value, `${path}.${key}`, depth);
  }
  return out;
}

function docNode(v: unknown, path: string, depth: number): DocNode {
  if (depth > MAX_DOC_DEPTH) return fail(path);
  const r = obj(v, path);
  const node: DocNode = { type: str(r.type, `${path}.type`, 100) };
  if (r.text !== undefined) node.text = str(r.text, `${path}.text`, MAX_TEXT);
  if (r.attrs !== undefined) node.attrs = attrs(obj(r.attrs, `${path}.attrs`), `${path}.attrs`, depth);
  if (r.content !== undefined) {
    node.content = list(r.content, `${path}.content`).map((c, i) => docNode(c, `${path}.content[${i}]`, depth + 1));
  }
  if (r.marks !== undefined) {
    node.marks = list(r.marks, `${path}.marks`).map((m, i) => {
      const mark = obj(m, `${path}.marks[${i}]`);
      const out: NonNullable<DocNode['marks']>[number] = { type: str(mark.type, `${path}.marks[${i}].type`, 100) };
      if (mark.attrs !== undefined) out.attrs = attrs(obj(mark.attrs, `${path}.marks[${i}].attrs`), `${path}.marks[${i}].attrs`, depth);
      return out;
    });
  }
  return node;
}

function folder(v: unknown, path: string): Folder {
  const r = obj(v, path);
  return {
    ...versioned(r, path),
    ...trashable(r, path),
    name: str(r.name, `${path}.name`),
    parentId: nullableId(r.parentId, `${path}.parentId`),
    order: num(r.order, `${path}.order`),
  };
}

function notebook(v: unknown, path: string): Notebook {
  const r = obj(v, path);
  const cover = obj(r.cover, `${path}.cover`);
  if (cover.kind !== 'solid') fail(`${path}.cover.kind`);
  return {
    ...versioned(r, path),
    ...trashable(r, path),
    name: str(r.name, `${path}.name`),
    description: str(r.description, `${path}.description`, 1000),
    folderId: nullableId(r.folderId, `${path}.folderId`),
    cover: { kind: 'solid', colour: colour(cover.colour, `${path}.cover.colour`) },
    tagIds: idList(r.tagIds, `${path}.tagIds`),
    favourite: bool(r.favourite, `${path}.favourite`),
    order: num(r.order, `${path}.order`),
  };
}

function page(v: unknown, path: string): Page {
  const r = obj(v, path);
  const layout = r.layout === 'continuous' || r.layout === 'paginated' ? r.layout : fail(`${path}.layout`);
  const notebookId = nullableId(r.notebookId, `${path}.notebookId`);
  const folderId = nullableId(r.folderId, `${path}.folderId`);
  if (notebookId !== null && folderId !== null) fail(`${path}.folderId`);
  return {
    ...versioned(r, path),
    ...trashable(r, path),
    title: str(r.title, `${path}.title`),
    notebookId,
    folderId,
    content: docNode(r.content, `${path}.content`, 0),
    plainText: str(r.plainText, `${path}.plainText`, MAX_TEXT),
    layout,
    tagIds: idList(r.tagIds, `${path}.tagIds`),
    favourite: bool(r.favourite, `${path}.favourite`),
    pinned: bool(r.pinned, `${path}.pinned`),
    order: num(r.order, `${path}.order`),
    lastOpenedAt: nullableNum(r.lastOpenedAt, `${path}.lastOpenedAt`),
  };
}

const MAX_STROKES = 20_000;
const MAX_POINT_VALUES = 3 * 50_000;

function oneOf<T extends string>(v: unknown, allowed: readonly T[], path: string): T {
  return allowed.find((a) => a === v) ?? fail(path);
}

function stroke(v: unknown, path: string): Stroke {
  const r = obj(v, path);
  const points = list(r.points, `${path}.points`);
  if (points.length > MAX_POINT_VALUES || points.length % 3 !== 0) fail(`${path}.points`);
  const size = num(r.size, `${path}.size`);
  if (size <= 0 || size > 200) fail(`${path}.size`);
  return {
    id: id(r.id, `${path}.id`),
    tool: oneOf(r.tool, DRAW_TOOLS, `${path}.tool`),
    colour: oneOf(r.colour, INK_COLOURS, `${path}.colour`),
    size,
    pen: bool(r.pen, `${path}.pen`),
    points: points.map((p, i) => num(p, `${path}.points[${i}]`)),
  };
}

function drawing(v: unknown, path: string): Drawing {
  const r = obj(v, path);
  const strokes = list(r.strokes, `${path}.strokes`);
  if (strokes.length > MAX_STROKES) fail(`${path}.strokes`);
  const width = num(r.width, `${path}.width`);
  const height = num(r.height, `${path}.height`);
  if (width <= 0 || width > 10_000) fail(`${path}.width`);
  if (height <= 0 || height > 10_000) fail(`${path}.height`);
  return {
    ...versioned(r, path),
    pageId: id(r.pageId, `${path}.pageId`),
    width,
    height,
    strokes: strokes.map((s, i) => stroke(s, `${path}.strokes[${i}]`)),
  };
}

function tag(v: unknown, path: string): Tag {
  const r = obj(v, path);
  return { ...versioned(r, path), name: str(r.name, `${path}.name`, 40), colour: colour(r.colour, `${path}.colour`) };
}

/** Unknown or invalid settings are left out: they are preferences, not content. */
function settings(v: unknown, path: string): SettingRecord[] {
  const out: SettingRecord[] = [];
  for (const item of list(v, path)) {
    if (!isRecord(item) || typeof item.key !== 'string') continue;
    const key = SETTING_KEYS.find((k) => k === item.key);
    if (key && isValidSetting(key, item.value)) {
      out.push({ key, value: item.value, updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0 });
    }
  }
  return out;
}

function unique<T extends { id: string }>(items: T[], path: string): T[] {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new BackupError('duplicate-id', `${path}: ${item.id}`);
    seen.add(item.id);
  }
  return items;
}

/** Parse and validate the text of a backup file. Throws BackupError. */
export function parseBackup(text: string): BackupFile {
  if (text.length > MAX_BACKUP_BYTES) throw new BackupError('too-large');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('not-json');
  }
  if (!isRecord(raw) || raw.app !== 'typenote' || !isRecord(raw.data)) throw new BackupError('not-typenote');
  const formatVersion = num(raw.formatVersion, 'formatVersion');
  const schemaVersion = num(raw.schemaVersion, 'schemaVersion');
  if (formatVersion > BACKUP_FORMAT_VERSION || schemaVersion > SCHEMA_VERSION) throw new BackupError('newer-version');

  const d = raw.data;
  const each = <T>(key: string, read: (v: unknown, path: string) => T) => list(d[key], key).map((v, i) => read(v, `${key}[${i}]`));
  return {
    app: 'typenote',
    formatVersion,
    schemaVersion,
    exportedAt: str(raw.exportedAt, 'exportedAt', 40),
    data: {
      folders: unique(each('folders', folder), 'folders'),
      notebooks: unique(each('notebooks', notebook), 'notebooks'),
      pages: unique(each('pages', page), 'pages'),
      tags: unique(each('tags', tag), 'tags'),
      settings: settings(d.settings ?? [], 'settings'),
      drawings: d.drawings === undefined ? [] : unique(each('drawings', drawing), 'drawings'),
    },
  };
}
