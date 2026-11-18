import { BookOpen, FileText, FileType2, Search, X } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { Link } from 'react-router';
import { cx } from '@/components/ui/Button';
import { NotebookCover, notebookPath, pagePath } from '@/features/organisation/items';
import { t } from '@/i18n/en';
import { MAX_QUERY_LENGTH, type Marked, type SearchHit, type SearchResults } from './search';

/** Text with its matched words marked. */
export function MarkedText({ value, className }: { value: Marked; className?: string }) {
  const parts: ReactNode[] = [];
  let at = 0;
  value.marks.forEach(([start, end], index) => {
    if (start > at) parts.push(value.text.slice(at, start));
    parts.push(
      <mark key={index} className="tn-mark">
        {value.text.slice(start, end)}
      </mark>,
    );
    at = end;
  });
  if (at < value.text.length) parts.push(value.text.slice(at));
  return <span className={className}>{parts}</span>;
}

/** Where a result opens: the page, scrolled to the words; or the PDF, at the first page with them. */
export function hitPath(hit: SearchHit, query: string): string {
  const q = encodeURIComponent(query.trim());
  if (hit.kind === 'page') return hit.count > 0 ? `${pagePath(hit.page.id)}?q=${q}` : pagePath(hit.page.id);
  return `/file/${hit.attachmentId}?page=${hit.firstPage}&q=${q}`;
}

export const hitKey = (hit: SearchHit): string => (hit.kind === 'page' ? `page-${hit.page.id}` : `pdf-${hit.attachmentId}-${hit.page.id}`);

/** The search field at the top of the home screen. */
export function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <form role="search" onSubmit={(event) => event.preventDefault()} className="relative mb-8">
      <label htmlFor={id} className="sr-only">
        {t.search.label}
      </label>
      <Search size={18} aria-hidden className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        id={id}
        type="search"
        value={value}
        maxLength={MAX_QUERY_LENGTH}
        placeholder={t.search.placeholder}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && value !== '' && (event.preventDefault(), onChange(''))}
        className="h-12 w-full rounded-lg border border-line-strong bg-surface ps-10 pe-12 text-base text-ink placeholder:text-muted/70 [&::-webkit-search-cancel-button]:hidden"
      />
      {value !== '' && (
        <button type="button" onClick={() => onChange('')} className="absolute end-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-accent-soft hover:text-ink">
          <X size={18} aria-hidden />
          <span className="sr-only">{t.search.clear}</span>
        </button>
      )}
    </form>
  );
}

function HitRow({ hit, query }: { hit: SearchHit; query: string }) {
  const isPdf = hit.kind === 'pdf';
  const Icon = isPdf ? FileType2 : FileText;
  const snippets = isPdf ? (hit.snippet.text ? [hit.snippet] : []) : hit.snippets;
  const meta = isPdf ? t.search.inPdf(hit.page.title, hit.pages.length === 0 ? null : hit.pages) : null;
  return (
    <li className="min-w-0">
      <Link to={hitPath(hit, query)} className="flex gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 hover:border-line-strong hover:bg-accent-soft/40">
        <Icon size={18} aria-hidden className="mt-0.5 shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <MarkedText value={isPdf ? hit.name : hit.title} className="min-w-0 flex-1 truncate font-medium text-ink" />
            {hit.count > 0 && <span className="shrink-0 text-xs text-muted tabular-nums">{t.search.matchCount(hit.count)}</span>}
          </span>
          {meta && <span className="block truncate text-xs text-muted">{meta}</span>}
          {snippets.map((snippet, index) => (
            <MarkedText key={index} value={snippet} className="mt-1 block text-sm leading-snug wrap-anywhere text-muted" />
          ))}
        </span>
      </Link>
    </li>
  );
}

/** Results grouped by notebook, each group under the notebook's name. */
export function SearchResultsList({ results, query }: { results: SearchResults; query: string }) {
  if (results.groups.length === 0) {
    return (
      <p role="status" className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
        {t.search.noResults(query.trim())}
      </p>
    );
  }
  return (
    <div>
      <p role="status" className="mb-4 text-sm text-muted">
        {t.search.summary(results.total, results.matches)}
      </p>
      <div className="flex flex-col gap-8">
        {results.groups.map((group) => (
          <section key={group.notebook?.id ?? 'loose'} aria-label={group.notebook ? group.name.text : t.library.loosePages}>
            <h2 className="mb-2 flex items-center gap-2">
              {group.notebook ? (
                <Link to={notebookPath(group.notebook.id)} className={cx('flex min-w-0 items-center gap-2 rounded font-display text-xl font-semibold text-ink hover:underline', group.nameMatched && 'decoration-accent')}>
                  <NotebookCover notebook={group.notebook} size="thumb" />
                  <MarkedText value={group.name} className="truncate" />
                </Link>
              ) : (
                <span className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
                  <BookOpen size={18} aria-hidden className="text-muted" />
                  {t.library.loosePages}
                </span>
              )}
              {group.hits.length > 0 && <span className="text-sm text-muted">· {t.search.inGroup(group.hits.length)}</span>}
            </h2>
            {group.hits.length === 0 ? (
              <p className="text-sm text-muted">{t.search.notebookOnly}</p>
            ) : (
              <ul className="grid gap-2">
                {group.hits.map((hit) => (
                  <HitRow key={hitKey(hit)} hit={hit} query={query} />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
