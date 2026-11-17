import { FilePlus, GraduationCap, House, Library, Paperclip, Waypoints, type LucideIcon, Menu as MenuIcon, PanelLeft, Search, Settings, Tag, Trash2, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Button, IconButton, cx } from '@/components/ui/Button';
import { writeSetting } from '@/database/repositories/settings';
import { formatShortcut } from '@/features/editor/commands';
import { useItemActions } from '@/features/organisation/useItemActions';
import { CommandPalette } from '@/features/search/CommandPalette';
import { useSettings } from '@/hooks/useData';
import { t } from '@/i18n/en';

interface Destination {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const primary: Destination[] = [
  { to: '/', label: t.nav.home, icon: House, end: true },
  { to: '/library', label: t.nav.library, icon: Library },
  { to: '/tags', label: t.nav.tags, icon: Tag },
  { to: '/files', label: t.nav.files, icon: Paperclip },
  { to: '/study', label: t.nav.study, icon: GraduationCap },
  { to: '/graph', label: t.nav.graph, icon: Waypoints },
];
const secondary: Destination[] = [
  { to: '/trash', label: t.nav.trash, icon: Trash2 },
  { to: '/settings', label: t.nav.settings, icon: Settings },
];

function NavItem({ destination, compact = false }: { destination: Destination; compact?: boolean }) {
  const { to, label, icon: Icon, end } = destination;
  return (
    <NavLink
      to={to}
      end={end}
      title={compact ? label : undefined}
      className={({ isActive }) =>
        cx(
          'flex min-h-10 items-center gap-3 rounded-md text-sm pointer-coarse:min-h-11',
          compact ? 'justify-center px-0' : 'px-3',
          // The active item is marked by weight and a bar, not by colour alone.
          isActive ? 'bg-accent-soft font-semibold text-ink shadow-[inset_3px_0_0_var(--tn-accent)]' : 'text-muted hover:bg-accent-soft hover:text-ink',
        )
      }
    >
      <Icon size={18} aria-hidden className="shrink-0" />
      <span className={compact ? 'sr-only' : undefined}>{label}</span>
    </NavLink>
  );
}

function NavList({ compact, onNewPage, onSearch }: { compact?: boolean; onNewPage: () => void; onSearch: () => void }) {
  return (
    <div className="flex h-full flex-col gap-4">
      <Button variant="primary" icon={FilePlus} onClick={onNewPage} className={compact ? 'px-0!' : undefined} aria-label={compact ? t.actions.newPage : undefined} title={compact ? t.actions.newPage : undefined}>
        <span className={compact ? 'sr-only' : undefined}>{t.actions.newPage}</span>
      </Button>
      <ul className="flex flex-col gap-1">
        <li>
          <button
            type="button"
            onClick={onSearch}
            aria-haspopup="dialog"
            title={compact ? t.nav.search : undefined}
            className={cx('flex min-h-10 w-full items-center gap-3 rounded-md text-sm text-muted hover:bg-accent-soft hover:text-ink pointer-coarse:min-h-11', compact ? 'justify-center px-0' : 'px-3')}
          >
            <Search size={18} aria-hidden className="shrink-0" />
            <span className={compact ? 'sr-only' : 'flex-1 text-start'}>{t.nav.search}</span>
            {!compact && (
              <kbd aria-hidden className="rounded border border-line px-1.5 font-sans text-xs">
                {formatShortcut('Mod+K')}
              </kbd>
            )}
          </button>
        </li>
        {primary.map((d) => (
          <li key={d.to}>
            <NavItem destination={d} compact={compact} />
          </li>
        ))}
      </ul>
      <ul className="mt-auto flex flex-col gap-1 border-t border-line pt-3">
        {secondary.map((d) => (
          <li key={d.to}>
            <NavItem destination={d} compact={compact} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Brand({ hidden = false }: { hidden?: boolean }) {
  return <span className={cx('font-display text-2xl font-semibold tracking-tight text-ink', hidden && 'sr-only')}>TypeNote</span>;
}

/** The slide-out navigation used on narrow screens. */
function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    return () => dialog.close?.();
  }, [open]);
  if (!open) return null;
  return (
    // The click handler only closes on the backdrop. The keyboard way out is Escape, which <dialog> provides.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-label={t.nav.main}
      onClose={onClose}
      onClick={(event) => event.target === ref.current && onClose()}
      className="m-0 h-dvh max-h-none w-72 max-w-[85vw] border-e border-line bg-sunken p-4 text-ink backdrop:bg-black/45"
    >
      <div className="mb-4 flex items-center justify-between">
        <Brand />
        <IconButton icon={X} label={t.nav.closeMenu} onClick={onClose} />
      </div>
      <div className="h-[calc(100%-4rem)]">{children}</div>
    </dialog>
  );
}

/**
 * The application frame.
 * Wide screens: a sidebar that can collapse to icons.
 * Narrow screens: a top bar with a navigation drawer, and a bottom bar for
 * the destinations a thumb reaches most often.
 */
export function AppShell() {
  const settings = useSettings();
  const { newPage } = useItemActions();
  const location = useLocation();
  // The drawer belongs to the screen it was opened on: going anywhere else closes it.
  const [drawerAt, setDrawerAt] = useState<string | null>(null);
  const drawerOpen = drawerAt === location.pathname;
  const setDrawerOpen = (open: boolean) => setDrawerAt(open ? location.pathname : null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const collapsed = settings.sidebarCollapsed;

  const createPage = () => void newPage();
  const openSearch = () => {
    setDrawerOpen(false);
    setPaletteOpen(true);
  };

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

      <nav data-chrome aria-label={t.nav.main} className={cx('sticky top-0 hidden h-dvh shrink-0 flex-col border-e border-line bg-sunken p-3 transition-[width] duration-(--tn-motion) md:flex', collapsed ? 'w-16' : 'w-60')}>
        <div className={cx('mb-4 flex items-center', collapsed ? 'justify-center' : 'justify-between ps-2')}>
          <Brand hidden={collapsed} />
          <IconButton icon={PanelLeft} label={collapsed ? t.nav.expandSidebar : t.nav.collapseSidebar} aria-expanded={!collapsed} onClick={() => void writeSetting('sidebarCollapsed', !collapsed)} />
        </div>
        <NavList compact={collapsed} onNewPage={createPage} onSearch={openSearch} />
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header data-chrome className="sticky top-0 z-20 flex h-(--tn-topbar) items-center gap-2 border-b border-line bg-sunken px-2 md:hidden">
          <IconButton icon={MenuIcon} label={t.nav.openMenu} aria-haspopup="dialog" onClick={() => setDrawerOpen(true)} />
          <Brand />
          <IconButton icon={Search} label={t.nav.search} aria-haspopup="dialog" onClick={openSearch} className="ms-auto" />
        </header>

        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 outline-none sm:px-6 md:px-10 md:pt-10 md:pb-10">
          <Outlet />
        </main>

        <nav data-chrome aria-label={t.nav.quick} className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-sunken md:hidden">
          <ul className="grid grid-cols-4">
            {[primary[0]!, primary[1]!].map((d) => (
              <li key={d.to}>
                <BottomLink destination={d} />
              </li>
            ))}
            <li>
              <button type="button" onClick={createPage} className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs text-muted">
                <span className="grid size-7 place-items-center rounded-full bg-accent text-on-accent">
                  <FilePlus size={16} aria-hidden />
                </span>
                {t.actions.newPage}
              </button>
            </li>
            <li>
              <BottomLink destination={secondary[1]!} />
            </li>
          </ul>
        </nav>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <NavList onNewPage={createPage} onSearch={openSearch} />
      </Drawer>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
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
