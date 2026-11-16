import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { applyAppearance, resolveTheme } from '@/features/settings/appearance';
import { DEFAULT_SETTINGS, resolveSettings } from '@/features/settings/model';
import { countCharacters, countWords, docToText, textToDoc } from '@/features/pages/plainDoc';
import { Button, IconButton } from './Button';
import { ConfirmDialog } from './Dialog';
import { Menu } from './Menu';
import { Star } from 'lucide-react';

describe('Button', () => {
  it('blocks clicks and reports busy while loading', async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('gives an icon-only button an accessible name and pressed state', () => {
    render(<IconButton icon={Star} label="Favourite" pressed />);
    expect(screen.getByRole('button', { name: 'Favourite' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Menu', () => {
  const setup = () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(
      <Menu
        label="Actions for Notes"
        items={[
          { id: 'rename', label: 'Rename', onSelect: onRename },
          { id: 'locked', label: 'Locked', disabled: true, onSelect: vi.fn() },
          { id: 'delete', label: 'Delete', onSelect: onDelete },
        ]}
      />,
    );
    return { onRename, onDelete, trigger: screen.getByRole('button', { name: 'Actions for Notes' }) };
  };

  it('works from the keyboard: opens, moves with arrows, skips disabled items, selects', async () => {
    const user = userEvent.setup();
    const { onDelete, trigger } = setup();
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onDelete).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const { onRename, trigger } = setup();
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onRename).not.toHaveBeenCalled();
  });
});

describe('ConfirmDialog', () => {
  it('starts focus on the safe choice, so Enter does not destroy anything', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog open onClose={onClose} onConfirm={onConfirm} title="Delete “Notes” permanently?" message="1 item will be deleted." confirmLabel="Delete permanently" cancelLabel="Keep in Trash" />);
    expect(screen.getByRole('button', { name: 'Keep in Trash' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('settings', () => {
  it('falls back to defaults for missing, damaged or hostile values', () => {
    expect(resolveSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(resolveSettings({ theme: 'neon', accent: 'red;}', recentCount: 9999, density: 'compact' })).toEqual({ ...DEFAULT_SETTINGS, density: 'compact' });
  });

  it('applies theme, density, motion and a readable accent to the document', () => {
    applyAppearance({ theme: 'midnight', accent: '#ffe08a', density: 'compact', motion: 'off' });
    const root = document.documentElement;
    expect(root.dataset).toMatchObject({ theme: 'midnight', density: 'compact', motion: 'off' });
    expect(root.style.getPropertyValue('--tn-accent')).toBe('#ffe08a');
    expect(root.style.getPropertyValue('--tn-accent-contrast')).toBe('#1f1d1a');
    applyAppearance({ ...DEFAULT_SETTINGS });
    expect(root.style.getPropertyValue('--tn-accent')).toBe('');
  });

  it('maps "system" to a light or dark built-in theme', () => {
    expect(resolveTheme('system', false)).toBe('classic');
    expect(resolveTheme('system', true)).toBe('dark-academia');
    expect(resolveTheme('rose', true)).toBe('rose');
  });
});

describe('plain-text page body', () => {
  it('round-trips text through the stored document format', () => {
    const text = 'First line\n\nThird line with émoji 🖋️';
    expect(docToText(textToDoc(text))).toBe(text);
    expect(docToText(textToDoc(''))).toBe('');
  });

  it('counts words and user-perceived characters', () => {
    expect(countWords('  one two\nthree ')).toBe(3);
    expect(countWords('')).toBe(0);
    expect(countCharacters('né🖋️')).toBe(3);
  });
});
