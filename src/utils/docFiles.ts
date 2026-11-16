import type { DocNode, Id } from '@/types/models';

/** Node types that show an attachment. Each holds the attachment's ID in `attachmentId`. */
export const FILE_NODE_TYPES = ['pdf', 'audio'] as const;

/** Every attachment ID that a document's blocks name, once each. */
export function attachmentIdsIn(doc: DocNode | undefined, into = new Set<Id>()): Set<Id> {
  if (!doc) return into;
  const stack: DocNode[] = [doc];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if ((FILE_NODE_TYPES as readonly string[]).includes(node.type)) {
      const id = node.attrs?.attachmentId;
      if (typeof id === 'string' && id !== '') into.add(id);
    }
    if (node.content) stack.push(...node.content);
  }
  return into;
}
