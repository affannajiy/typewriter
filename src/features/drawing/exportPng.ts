import type { Stroke } from '@/types/models';
import { paintOrder } from './DrawingView';
import { HIGHLIGHTER_OPACITY, INK_TOKEN, strokePath } from './geometry';

/** Pixels per canvas unit in the exported image: twice the canvas size, sharp on a high-density screen. */
export const EXPORT_SCALE = 2;

export function drawingFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `typenote-drawing-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.png`;
}

/** Reads a theme token's current value, so the image looks as the drawing does on screen. */
const token = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/** Paints the drawing on a canvas, with the paper colour behind it, and returns it as a PNG. */
export async function drawingToPng(strokes: Stroke[], width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * EXPORT_SCALE);
  canvas.height = Math.round(height * EXPORT_SCALE);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas');
  context.fillStyle = token('--tn-surface', '#ffffff');
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(EXPORT_SCALE, EXPORT_SCALE);
  for (const stroke of paintOrder(strokes)) {
    const d = strokePath(stroke);
    if (!d) continue;
    context.globalAlpha = stroke.tool === 'highlighter' ? HIGHLIGHTER_OPACITY : 1;
    context.fillStyle = token(INK_TOKEN[stroke.colour], '#000000');
    context.fill(new Path2D(d));
  }
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png'));
}
