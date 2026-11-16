import { isHexColour, readableOn } from '@/utils/colour';
import { type AppSettings, DEFAULT_SETTINGS, type ThemeChoice, type ThemeId, resolveSettings } from './model';

type Appearance = Pick<AppSettings, 'theme' | 'accent' | 'density' | 'motion'>;

/**
 * The database is the source of truth for settings. This localStorage copy
 * only lets the first paint use the right theme before IndexedDB has opened.
 * It is rewritten every time the appearance is applied.
 */
const CACHE_KEY = 'typenote.appearance';

const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

export function resolveTheme(choice: ThemeChoice, dark: boolean): ThemeId {
  if (choice !== 'system') return choice;
  return dark ? 'dark-academia' : 'classic';
}

/** Apply theme, accent, density and motion to the document root. */
export function applyAppearance(appearance: Appearance): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(appearance.theme, prefersDark());
  root.dataset.density = appearance.density;
  root.dataset.motion = appearance.motion;
  if (appearance.accent && isHexColour(appearance.accent)) {
    root.style.setProperty('--tn-accent', appearance.accent);
    root.style.setProperty('--tn-accent-contrast', readableOn(appearance.accent));
  } else {
    root.style.removeProperty('--tn-accent');
    root.style.removeProperty('--tn-accent-contrast');
  }
  try {
    const { theme, accent, density, motion } = appearance;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ theme, accent, density, motion }));
  } catch {
    // localStorage can be unavailable (private mode). The cache is optional.
  }
}

export function applyCachedAppearance(): void {
  let cached: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
    if (typeof parsed === 'object' && parsed !== null) cached = parsed as Record<string, unknown>;
  } catch {
    cached = {};
  }
  applyAppearance(resolveSettings({ ...DEFAULT_SETTINGS, ...cached }));
}
