import type { DocNode } from '@/types/models';

/**
 * Conversion of data written before 0.8.0.
 *
 * 0.8.0 removed folders, tags, page links, flashcards and the words-written
 * log. The schema upgrade (version 6) and the backup reader both bring old
 * records into the new shape with these functions, so the two always agree.
 */

/** Settings that 0.8.0 removed. Their stored rows are deleted. */
export const REMOVED_SETTING_KEYS = ['recentCount', 'dailyGoal', 'studyNewPerDay', 'studyRetention', 'sidebarCollapsed'] as const;

/** Tables that 0.8.0 removed. A backup's copies of them are not read. */
export const REMOVED_TABLES = ['folders', 'tags', 'writingDays', 'decks', 'flashcards', 'reviewLogs'] as const;

const sameMarks = (a: DocNode['marks'], b: DocNode['marks']) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/** Join neighbouring text nodes with the same marks, as the editor would have stored them. */
function joinText(nodes: DocNode[]): DocNode[] {
  const out: DocNode[] = [];
  for (const node of nodes) {
    const last = out[out.length - 1];
    if (last && typeof last.text === 'string' && typeof node.text === 'string' && sameMarks(last.marks, node.marks)) {
      out[out.length - 1] = { ...last, text: last.text + node.text };
    } else {
      out.push(node);
    }
  }
  return out;
}

/**
 * A page link becomes the plain text of its title. Nothing else changes.
 * Returns the same object when there is nothing to convert.
 */
export function convertLegacyDoc(node: DocNode): DocNode {
  if (!node.content) return node;
  let changed = false;
  const content: DocNode[] = [];
  for (const child of node.content) {
    if (child.type === 'pageLink') {
      changed = true;
      const title = String(child.attrs?.title ?? '');
      if (title !== '') content.push(child.marks ? { type: 'text', text: title, marks: child.marks } : { type: 'text', text: title });
      continue;
    }
    const converted = convertLegacyDoc(child);
    if (converted !== child) changed = true;
    content.push(converted);
  }
  return changed ? { ...node, content: joinText(content) } : node;
}

/** Remove the fields 0.8.0 dropped from a stored notebook or page, in place. */
export function dropLegacyFields(record: Record<string, unknown>): void {
  delete record.folderId;
  delete record.tagIds;
}
