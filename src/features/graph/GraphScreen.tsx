import { Maximize, Waypoints, ZoomIn, ZoomOut } from 'lucide-react';
import { type PointerEvent, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { IconButton, cx } from '@/components/ui/Button';
import { EmptyState, LoadingBlock, PageHeader, Section } from '@/components/ui/Layout';
import { buildLinkIndex } from '@/features/links/links';
import { pagePath } from '@/features/organisation/items';
import { useWorkspace } from '@/hooks/useData';
import { t } from '@/i18n/en';
import type { Id, Page } from '@/types/models';
import { GRAPH_SIZE, type GraphEdge, MAX_GRAPH_NODES, layoutGraph } from './layout';

interface View {
  x: number;
  y: number;
  size: number;
}

const FULL: View = { x: 0, y: 0, size: GRAPH_SIZE };
const MIN_SIZE = GRAPH_SIZE / 6;
const MAX_SIZE = GRAPH_SIZE * 2;

const shortTitle = (title: string) => (title.length > 28 ? `${title.slice(0, 26)}…` : title);

/**
 * The knowledge graph: pages as points, links between them as lines. Every
 * point is an ordinary link to its page, so the graph is usable with the
 * keyboard; the same information follows as a list for screen readers and
 * for anyone who prefers text.
 */
export default function GraphScreen() {
  const workspace = useWorkspace();
  const [showUnlinked, setShowUnlinked] = useState(false);
  const [active, setActive] = useState<Id | null>(null);
  const [view, setView] = useState<View>(FULL);
  const drag = useRef<{ x: number; y: number; view: View; scale: number } | null>(null);

  const graph = useMemo(() => {
    if (!workspace) return null;
    const pages = workspace.pages;
    const index = buildLinkIndex(pages);
    const degree = new Map<Id, number>();
    const pairs = new Map<string, GraphEdge>();
    for (const [from, targets] of index.outgoing) {
      for (const to of targets) {
        const key = from < to ? `${from}|${to}` : `${to}|${from}`;
        if (pairs.has(key)) continue;
        pairs.set(key, { from, to });
        degree.set(from, (degree.get(from) ?? 0) + 1);
        degree.set(to, (degree.get(to) ?? 0) + 1);
      }
    }
    const candidates = pages.filter((page) => showUnlinked || (degree.get(page.id) ?? 0) > 0);
    const shown = [...candidates].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.title.localeCompare(b.title)).slice(0, MAX_GRAPH_NODES);
    const ids = new Set(shown.map((page) => page.id));
    const edges = [...pairs.values()].filter((edge) => ids.has(edge.from) && ids.has(edge.to));
    // Sorted by ID so the picture does not depend on the order pages are read in.
    const ordered = [...shown].sort((a, b) => (a.id < b.id ? -1 : 1));
    const positions = layoutGraph(
      ordered.map((page) => page.id),
      edges,
    );
    const neighbours = new Map<Id, Set<Id>>();
    for (const edge of edges) {
      (neighbours.get(edge.from) ?? neighbours.set(edge.from, new Set()).get(edge.from)!).add(edge.to);
      (neighbours.get(edge.to) ?? neighbours.set(edge.to, new Set()).get(edge.to)!).add(edge.from);
    }
    return { pages: shown, total: candidates.length, edges, positions, degree, neighbours, index, linkCount: pairs.size };
  }, [workspace, showUnlinked]);

  if (!workspace || !graph) return <LoadingBlock />;
  const byId = new Map<Id, Page>(workspace.pages.map((page) => [page.id, page]));
  const near = active ? graph.neighbours.get(active) : undefined;
  const lit = (id: Id) => !active || id === active || near?.has(id) === true;

  const zoom = (factor: number) =>
    setView((v) => {
      const size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, v.size * factor));
      return { size, x: v.x + (v.size - size) / 2, y: v.y + (v.size - size) / 2 };
    });

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if ((event.target as Element).closest('a')) return;
    const box = event.currentTarget.getBoundingClientRect();
    drag.current = { x: event.clientX, y: event.clientY, view, scale: view.size / Math.max(1, Math.min(box.width, box.height)) };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const start = drag.current;
    if (!start) return;
    setView({ ...start.view, x: start.view.x - (event.clientX - start.x) * start.scale, y: start.view.y - (event.clientY - start.y) * start.scale });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const empty = graph.edges.length === 0 && !showUnlinked;

  return (
    <>
      <PageHeader title={t.graph.title} description={t.graph.description} />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="flex min-h-10 items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={showUnlinked} onChange={(event) => setShowUnlinked(event.target.checked)} className="size-4 accent-(--tn-accent)" />
          {t.graph.showUnlinked}
        </label>
        <p className="text-sm text-muted">{t.graph.summary(graph.pages.length, graph.edges.length)}</p>
        {graph.total > graph.pages.length && <p className="text-sm text-muted">{t.graph.tooMany(graph.pages.length, graph.total)}</p>}
        <div className="ms-auto flex items-center">
          <IconButton icon={ZoomOut} label={t.graph.zoomOut} onClick={() => zoom(1.25)} />
          <IconButton icon={ZoomIn} label={t.graph.zoomIn} onClick={() => zoom(0.8)} />
          <IconButton icon={Maximize} label={t.graph.reset} onClick={() => setView(FULL)} />
        </div>
      </div>

      {empty ? (
        <EmptyState icon={Waypoints} title={t.graph.emptyTitle} body={t.graph.emptyBody} />
      ) : (
        <svg
          role="group"
          aria-label={t.graph.label(graph.pages.length, graph.edges.length)}
          viewBox={`${view.x} ${view.y} ${view.size} ${view.size}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="aspect-square max-h-[75vh] w-full cursor-grab touch-none rounded-xl border border-line bg-surface select-none active:cursor-grabbing"
        >
          <g aria-hidden>
            {graph.edges.map((edge) => {
              const a = graph.positions.get(edge.from)!;
              const b = graph.positions.get(edge.to)!;
              const on = active !== null && (edge.from === active || edge.to === active);
              return <line key={`${edge.from}-${edge.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={cx('tn-graph-edge', on && 'is-on', active && !on && 'is-dim')} />;
            })}
          </g>
          {graph.pages.map((page) => {
            const point = graph.positions.get(page.id)!;
            const links = graph.degree.get(page.id) ?? 0;
            const radius = 7 + Math.min(12, Math.sqrt(links) * 3);
            return (
              <a
                key={page.id}
                href={`#${pagePath(page.id)}`}
                aria-label={t.graph.node(page.title, links)}
                onMouseEnter={() => setActive(page.id)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(page.id)}
                onBlur={() => setActive(null)}
                className={cx('tn-graph-node', !lit(page.id) && 'is-dim', active === page.id && 'is-active')}
              >
                <circle cx={point.x} cy={point.y} r={radius} />
                <text x={point.x} y={point.y + radius + 16} textAnchor="middle">
                  {shortTitle(page.title)}
                </text>
              </a>
            );
          })}
        </svg>
      )}

      {!empty && (
        <Section title={t.graph.list}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {graph.pages.map((page) => {
              const to = (graph.index.outgoing.get(page.id) ?? []).map((id) => byId.get(id)).filter((p): p is Page => p !== undefined);
              const from = (graph.index.incoming.get(page.id) ?? []).map((id) => byId.get(id)).filter((p): p is Page => p !== undefined);
              const list = (items: Page[]) =>
                items.length === 0
                  ? t.graph.none
                  : items.map((item, i) => (
                      <span key={item.id}>
                        {i > 0 && ', '}
                        <Link to={pagePath(item.id)} className="text-ink underline underline-offset-2">
                          {item.title}
                        </Link>
                      </span>
                    ));
              return (
                <li key={page.id} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                  <Link to={pagePath(page.id)} className="font-medium text-ink hover:underline">
                    {page.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {t.graph.linksTo}: {list(to)}
                  </p>
                  <p className="text-xs text-muted">
                    {t.graph.linkedFrom}: {list(from)}
                  </p>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </>
  );
}
