import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getPage } from '@/database/repositories/pages';
import { cx } from '@/components/ui/Button';
import { t } from '@/i18n/en';

/** A link to a page, showing the page's current title. Following it is an ordinary link. */
export function PageLinkView({ node, selected }: ReactNodeViewProps) {
  const pageId = typeof node.attrs.pageId === 'string' ? node.attrs.pageId : '';
  const stored = typeof node.attrs.title === 'string' && node.attrs.title !== '' ? node.attrs.title : t.links.untitled;
  // undefined: loading. null: no such page.
  const page = useLiveQuery(async () => (pageId ? ((await getPage(pageId)) ?? null) : null), [pageId]);
  const missing = page === null;
  const trashed = page ? page.deletedAt !== null : false;
  const title = page ? page.title : stored;
  const state = missing ? t.links.missing : trashed ? t.links.inTrash : null;

  return (
    <NodeViewWrapper as="span" className="tn-page-link" contentEditable={false} data-page-id={pageId}>
      <a
        href={`#/page/${pageId}`}
        title={state ?? undefined}
        aria-label={state ? t.links.labelWithState(title, state) : undefined}
        className={cx(
          'rounded-sm font-medium underline decoration-2 underline-offset-2 hover:bg-accent-soft',
          missing || trashed ? 'text-muted line-through' : 'text-ink decoration-accent',
          selected && 'outline-2 outline-offset-2 outline-focus',
        )}
      >
        {title}
      </a>
    </NodeViewWrapper>
  );
}
