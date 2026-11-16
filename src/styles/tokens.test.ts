import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEME_IDS } from '@/features/settings/model';
import { contrast } from '@/utils/colour';

/** Read each theme's colour tokens straight from the stylesheet, so the test checks what ships. */
function readThemes(): Record<string, Record<string, string>> {
  const css = readFileSync('src/styles/tokens.css', 'utf8');
  const themes: Record<string, Record<string, string>> = {};
  for (const block of css.matchAll(/\[data-theme='([\w-]+)'\]\s*\{([^}]*)\}/g)) {
    const tokens: Record<string, string> = {};
    for (const token of block[2]!.matchAll(/--tn-([\w-]+):\s*(#[0-9a-f]{6})/gi)) tokens[token[1]!] = token[2]!;
    themes[block[1]!] = tokens;
  }
  return themes;
}

const themes = readThemes();

// WCAG 2.2 AA: 4.5:1 for text (1.4.3), 3:1 for control boundaries and focus (1.4.11, 2.4.7).
const textPairs: [string, string][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text', 'sunken'],
  ['text-muted', 'bg'],
  ['text-muted', 'surface'],
  ['text-muted', 'sunken'],
  ['accent-contrast', 'accent'],
  ['danger', 'surface'],
  ['danger', 'bg'],
  ['success', 'surface'],
];
const nonTextPairs: [string, string][] = [
  ['border-strong', 'bg'],
  ['border-strong', 'surface'],
  ['focus', 'bg'],
  ['focus', 'surface'],
  ['focus', 'sunken'],
  ['accent', 'bg'],
];

describe('theme tokens', () => {
  it('defines every built-in theme', () => {
    expect(Object.keys(themes).sort()).toEqual([...THEME_IDS].sort());
  });

  describe.each(THEME_IDS)('%s', (id) => {
    const theme = themes[id]!;
    it.each(textPairs)('%s on %s meets 4.5:1', (fg, bg) => {
      expect(contrast(theme[fg]!, theme[bg]!)).toBeGreaterThanOrEqual(4.5);
    });
    it.each(nonTextPairs)('%s against %s meets 3:1', (fg, bg) => {
      expect(contrast(theme[fg]!, theme[bg]!)).toBeGreaterThanOrEqual(3);
    });
  });
});
