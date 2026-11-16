import { isHexColour } from '@/utils/colour';

/**
 * Application settings. Each setting is one row in the `settings` table.
 * Stored values are never trusted: resolveSettings() validates every key and
 * falls back to the default, so a damaged or imported value cannot break the app.
 */

export const THEME_IDS = ['classic', 'dark-academia', 'minimalist', 'forest', 'midnight', 'rose'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export type ThemeChoice = ThemeId | 'system';

export interface AppSettings {
  theme: ThemeChoice;
  /** Custom accent colour, or null to use the theme's own. */
  accent: string | null;
  density: 'comfortable' | 'compact';
  /** 'system' follows the operating system's reduced-motion preference. */
  motion: 'system' | 'on' | 'off';
  libraryView: 'shelf' | 'list';
  sidebarCollapsed: boolean;
  /** Number of items in each dashboard list. */
  recentCount: number;
  lastBackupAt: number | null;
  /** Typewriter sounds while writing. Off until the writer turns them on. */
  typingSound: boolean;
  /** 0 to 100. */
  soundVolume: number;
  /**
   * When the bell rings. 'return': with every carriage return, so on each new
   * line. 'margin': a few characters before the line ends, as on a real machine.
   */
  soundBell: 'return' | 'margin' | 'off';
  /** Paper for the paginated layout. One choice for every page, for now. */
  pageSize: 'a4' | 'letter' | 'a5';
  pageMargin: 'narrow' | 'normal' | 'wide';
}

export type SettingKey = keyof AppSettings;

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'classic',
  accent: null,
  density: 'comfortable',
  motion: 'system',
  libraryView: 'shelf',
  sidebarCollapsed: false,
  recentCount: 6,
  lastBackupAt: null,
  typingSound: false,
  soundVolume: 60,
  soundBell: 'return',
  pageSize: 'a4',
  pageMargin: 'normal',
};

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

const oneOf =
  <T extends string>(options: readonly T[]) =>
  (v: unknown): v is T =>
    typeof v === 'string' && (options as readonly string[]).includes(v);

const validators: { [K in SettingKey]: (v: unknown) => v is AppSettings[K] } = {
  theme: oneOf([...THEME_IDS, 'system']),
  accent: (v): v is string | null => v === null || isHexColour(v),
  density: oneOf(['comfortable', 'compact']),
  motion: oneOf(['system', 'on', 'off']),
  libraryView: oneOf(['shelf', 'list']),
  sidebarCollapsed: (v): v is boolean => typeof v === 'boolean',
  recentCount: (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 3 && v <= 20,
  lastBackupAt: (v): v is number | null => v === null || (typeof v === 'number' && Number.isFinite(v)),
  typingSound: (v): v is boolean => typeof v === 'boolean',
  soundVolume: (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100,
  soundBell: oneOf(['return', 'margin', 'off']),
  pageSize: oneOf(['a4', 'letter', 'a5']),
  pageMargin: oneOf(['narrow', 'normal', 'wide']),
};

export function isValidSetting<K extends SettingKey>(key: K, value: unknown): value is AppSettings[K] {
  return validators[key](value);
}

export function resolveSettings(raw: Record<string, unknown>): AppSettings {
  const resolved = { ...DEFAULT_SETTINGS } as Record<SettingKey, unknown>;
  for (const key of SETTING_KEYS) {
    if (key in raw && isValidSetting(key, raw[key])) resolved[key] = raw[key];
  }
  return resolved as unknown as AppSettings;
}
