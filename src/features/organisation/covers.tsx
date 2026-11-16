import { Book, Calculator, Code, Compass, Feather, FlaskConical, Globe, Heart, Leaf, type LucideIcon, Music, Palette, Star } from 'lucide-react';
import type { Notebook, NotebookIcon } from '@/types/models';
import { readableOn } from '@/utils/colour';

export const NOTEBOOK_ICON_GLYPHS: Record<NotebookIcon, LucideIcon> = {
  book: Book,
  feather: Feather,
  flask: FlaskConical,
  calculator: Calculator,
  globe: Globe,
  music: Music,
  palette: Palette,
  leaf: Leaf,
  heart: Heart,
  star: Star,
  code: Code,
  compass: Compass,
};

/**
 * The cover of a notebook: a coloured board, plain or with a pressed pattern,
 * with its icon and the title set in the display face. The title colour is
 * computed from the cover colour, so it stays readable.
 */
export function NotebookCover({ notebook, size = 'card' }: { notebook: Pick<Notebook, 'name' | 'cover'> & { icon?: Notebook['icon'] }; size?: 'card' | 'thumb' }) {
  const ink = readableOn(notebook.cover.colour);
  if (size === 'thumb') {
    return <span aria-hidden data-kind={notebook.cover.kind} className="tn-cover block h-10 w-8 shrink-0 rounded-sm border-s-4 border-black/25" style={{ backgroundColor: notebook.cover.colour }} />;
  }
  const Glyph = notebook.icon ? NOTEBOOK_ICON_GLYPHS[notebook.icon] : null;
  return (
    <div data-kind={notebook.cover.kind} className="tn-cover flex aspect-[3/4] flex-col justify-between rounded-md border-s-8 border-black/25 p-3 shadow-soft" style={{ backgroundColor: notebook.cover.colour, color: ink }}>
      <span aria-hidden className="h-px w-full opacity-40" style={{ backgroundColor: ink }} />
      <span className="flex flex-col gap-2">
        {Glyph && <Glyph aria-hidden size={28} strokeWidth={1.5} />}
        <span className="font-display text-xl leading-tight font-semibold break-words line-clamp-4">{notebook.name}</span>
      </span>
      <span aria-hidden className="h-px w-full opacity-40" style={{ backgroundColor: ink }} />
    </div>
  );
}
