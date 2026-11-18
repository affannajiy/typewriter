import { FilePlus, Keyboard, Library, type LucideIcon, Search, Settings, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useMatch } from 'react-router';
import { cx } from '@/components/ui/Button';
import { formatShortcut } from '@/features/editor/commands';
import { useItemActions } from '@/features/organisation/useItemActions';
import { CommandPalette } from '@/features/search/CommandPalette';
import { t } from '@/i18n/en';

interface Destination {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const primary: Destination[] = [
  { to: '/', label: t.nav.notebooks, icon: Library, end: true },
  { to: '/typing', label: t.nav.typingTest, icon: Keyboard },
];
const secondary: Destination[] = [
  { to: '/trash', label: t.nav.trash, icon: Trash2 },
  { to: '/settings', label: t.nav.settings, icon: Settings },
];

/** Shared look of a rail button. The active one is marked by a bar and weight, not colour alone. */
const railItem = 'grid size-11 place-items-center rounded-md text-muted hover:bg-accent-soft hover:text-ink';

function RailLink({ destination }: { destination: Destination }) {
  const { to, label, icon: Icon, end } = destination;
  return (
    <NavLink to={to} end={end} title={label} className={({ isActive }) => cx(railItem, isActive && 'bg-accent-soft text-ink shadow-[inset_3px_0_0_var(--tn-accent)]')}>
      <Icon size={20} aria-hidden />
      <span className="sr-only">{label}</span>
    </NavLink>
  );
}

function BottomLink({ destination }: { destination: Destination }) {
  const { to, label, icon: Icon, end } = destination;
  return (
    <NavLink to={to} end={end} className={({ isActive }) => cx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs', isActive ? 'font-semibold text-ink shadow-[inset_0_3px_0_var(--tn-accent)]' : 'text-muted')}>
      <span className="grid size-7 place-items-center">
        <Icon size={20} aria-hidden />
      </span>
      {label}
    </NavLink>
  );
}

/**
 * While the writer types, the navigation fades away; moving the pointer
 * brings it back. Keys that are only shortcuts do not count as typing.
 */
function useFadeWhileTyping() {
  useEffect(() => {
    const root = document.documentElement;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('.tn-prose, #page-title')) root.dataset.typing = 'on';
    };
    const show = () => {
      delete root.dataset.typing;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointermove', show);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointermove', show);
      show();
    };
  }, []);
}

/**
 * The application frame.
 * Wide screens: a slim rail of icons (new page, search, notebooks, typing
 * test, Trash, Settings). Narrow screens: a top bar with search, and a bottom
 * bar with the four destinations.
 */
export function AppShell() {
  const { newPage } = useItemActions();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  // Inside a notebook, a new page goes into that notebook.
  const notebookId = useMatch('/notebook/:notebookId')?.params.notebookId ?? null;
  useFadeWhileTyping();

  const createPage = () => void newPage({ notebookId });
  const newPageLabel = notebookId ? t.actions.newPage : t.actions.newLoosePage;
  const searchLabel = `${t.nav.search} (${formatShortcut('Mod+K')})`;

  // Ctrl/Cmd + K opens search and commands from anywhere.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex min-h-dvh">
      <a href="#main" onClick={(e) => (e.preventDefault(), mainRef.current?.focus())} className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-ink">
        {t.nav.skip}
      </a>

      <nav data-chrome aria-label={t.nav.main} className="tn-rail sticky top-0 hidden h-dvh w-16 shrink-0 flex-col items-center gap-2 border-e border-line bg-sunken py-3 md:flex">
        <NavLink to="/" title="TypeNote" className="mb-2 grid size-11 place-items-center rounded-md font-display text-2xl font-semibold text-ink hover:bg-accent-soft">
          <span aria-hidden>T</span>
          <span className="sr-only">TypeNote</span>
        </NavLink>
        <button type="button" onClick={createPage} title={newPageLabel} className="grid size-11 place-items-center rounded-md bg-accent text-on-accent hover:opacity-90">
          <FilePlus size={20} aria-hidden />
          <span className="sr-only">{newPageLabel}</span>
        </button>
        <button type="button" onClick={() => setPaletteOpen(true)} aria-haspopup="dialog" title={searchLabel} className={railItem}>
          <Search size={20} aria-hidden />
          <span className="sr-only">{t.nav.search}</span>
        </button>
        <ul className="flex flex-col gap-1">
          {primary.map((d) => (
            <li key={d.to}>
              <RailLink destination={d} />
            </li>
          ))}
        </ul>
        <ul className="mt-auto flex flex-col gap-1 border-t border-line pt-3">
          {secondary.map((d) => (
            <li key={d.to}>
              <RailLink destination={d} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header data-chrome className="sticky top-0 z-20 flex h-(--tn-topbar) items-center gap-2 border-b border-line bg-sunken px-4 md:hidden">
          <NavLink to="/" className="font-display text-2xl font-semibold tracking-tight text-ink">
            TypeNote
          </NavLink>
          <button type="button" onClick={() => setPaletteOpen(true)} aria-haspopup="dialog" className="ms-auto grid size-11 place-items-center rounded-md text-muted hover:bg-accent-soft hover:text-ink">
            <Search size={20} aria-hidden />
            <span className="sr-only">{t.nav.search}</span>
          </button>
        </header>

        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 outline-none sm:px-6 md:px-10 md:pt-10 md:pb-10">
          <Outlet />
        </main>

        <nav data-chrome aria-label={t.nav.quick} className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-sunken md:hidden">
          <ul className="grid grid-cols-4">
            {[...primary, ...secondary].map((d) => (
              <li key={d.to}>
                <BottomLink destination={d} />
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
