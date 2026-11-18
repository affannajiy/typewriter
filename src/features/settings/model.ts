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
  lastBackupAt: number | null;
  /** Typewriter sounds while writing. On from the start: the typewriter is the point of the app. */
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
  /** Typeface of the page text: Lora, Inter, or JetBrains Mono. */
  editorFont: EditorFont;
  editorSize: EditorSize;
  editorLeading: EditorLeading;
  /** Width of the text column in the continuous layout. Sheets have the paper's width. */
  editorWidth: EditorWidth;
  /** Rules printed on the paper, in both layouts. */
  paperStyle: PaperStyle;
  /** In focus mode, fade every block except the one being written. */
  focusDim: boolean;
  /** Which typewriter the sounds model. */
  soundMachine: SoundMachine;
}

export const EDITOR_FONTS = ['serif', 'sans', 'mono'] as const;
export type EditorFont = (typeof EDITOR_FONTS)[number];
export const EDITOR_SIZES = ['small', 'medium', 'large', 'xlarge'] as const;
export type EditorSize = (typeof EDITOR_SIZES)[number];
export const EDITOR_LEADINGS = ['tight', 'normal', 'loose'] as const;
export type EditorLeading = (typeof EDITOR_LEADINGS)[number];
export const EDITOR_WIDTHS = ['narrow', 'normal', 'wide'] as const;
export type EditorWidth = (typeof EDITOR_WIDTHS)[number];
export const PAPER_STYLES = ['plain', 'lined', 'grid', 'dotted'] as const;
export type PaperStyle = (typeof PAPER_STYLES)[number];
export const SOUND_MACHINES = ['desk', 'portable', 'office'] as const;
export type SoundMachine = (typeof SOUND_MACHINES)[number];

export type SettingKey = keyof AppSettings;

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'classic',
  accent: null,
  density: 'comfortable',
  motion: 'system',
  libraryView: 'shelf',
  lastBackupAt: null,
  typingSound: true,
  soundVolume: 60,
  soundBell: 'return',
  pageSize: 'a4',
  pageMargin: 'normal',
  editorFont: 'mono',
  editorSize: 'medium',
  editorLeading: 'normal',
  editorWidth: 'normal',
  paperStyle: 'plain',
  focusDim: true,
  soundMachine: 'desk',
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
  lastBackupAt: (v): v is number | null => v === null || (typeof v === 'number' && Number.isFinite(v)),
  typingSound: (v): v is boolean => typeof v === 'boolean',
  soundVolume: (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100,
  soundBell: oneOf(['return', 'margin', 'off']),
  pageSize: oneOf(['a4', 'letter', 'a5']),
  pageMargin: oneOf(['narrow', 'normal', 'wide']),
  editorFont: oneOf(EDITOR_FONTS),
  editorSize: oneOf(EDITOR_SIZES),
  editorLeading: oneOf(EDITOR_LEADINGS),
  editorWidth: oneOf(EDITOR_WIDTHS),
  paperStyle: oneOf(PAPER_STYLES),
  focusDim: (v): v is boolean => typeof v === 'boolean',
  soundMachine: oneOf(SOUND_MACHINES),
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
