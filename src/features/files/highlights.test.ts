import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64 } from '@/utils/base64';
import { cleanQuote, fromPageRects, hitsRects, mergeLines, toPageRects } from './highlights';

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });
const page = box(100, 50, 600, 800);

describe('highlight geometry', () => {
  it('merges the pieces of one line, with the spaces between words, into one rectangle', () => {
    const words = [box(10, 100, 40, 12), box(54, 100, 30, 12), box(88, 101, 50, 11)];
    expect(mergeLines(words)).toEqual([box(10, 100, 128, 12)]);
  });

  it('keeps lines apart, and pieces of one line that are far apart', () => {
    const lines = [box(10, 100, 100, 12), box(10, 116, 80, 12), box(400, 100, 50, 12)];
    expect(mergeLines(lines)).toEqual([box(10, 100, 100, 12), box(400, 100, 50, 12), box(10, 116, 80, 12)]);
  });

  it('drops empty pieces such as line ends', () => {
    expect(mergeLines([box(10, 100, 0, 12), box(10, 100, 50, 0.5), box(20, 120, 30, 12)])).toEqual([box(20, 120, 30, 12)]);
  });

  it('stores rectangles as fractions of the page, so they fit at any zoom', () => {
    const rects = toPageRects([box(160, 130, 300, 16)], page);
    expect(rects).toEqual([0.1, 0.1, 0.5, 0.02]);
    // The same text at twice the size gives the same fractions.
    const twice = box(200, 100, 1200, 1600);
    expect(toPageRects([box(320, 260, 600, 32)], twice)).toEqual(rects);
  });

  it('cuts off what lies outside the page and ignores boxes far taller than a line', () => {
    expect(toPageRects([box(50, 130, 200, 16)], page)).toEqual([0, 0.1, 0.25, 0.02]);
    expect(toPageRects([box(800, 130, 100, 16)], page)).toEqual([]);
    expect(toPageRects([box(100, 50, 600, 800)], page)).toEqual([]);
    expect(toPageRects([box(160, 130, 300, 16)], box(0, 0, 0, 0))).toEqual([]);
  });

  it('turns stored rectangles back into boxes and finds a point inside them', () => {
    const rects = [0.1, 0.1, 0.5, 0.02, 0.1, 0.13, 0.3, 0.02];
    expect(fromPageRects(rects)).toEqual([box(0.1, 0.1, 0.5, 0.02), box(0.1, 0.13, 0.3, 0.02)]);
    expect(hitsRects(rects, 0.3, 0.11)).toBe(true);
    expect(hitsRects(rects, 0.5, 0.14)).toBe(false);
  });

  it('tidies the quoted text', () => {
    expect(cleanQuote('  The  first\nline and\t the second ')).toBe('The first line and the second');
  });
});

describe('base64 for file bytes', () => {
  it('round trips any bytes, including large ones', () => {
    const bytes = new Uint8Array(200_000).map((_, i) => (i * 7) % 256);
    const text = bytesToBase64(bytes.buffer);
    expect(new Uint8Array(base64ToBytes(text)!)).toEqual(bytes);
    expect(base64ToBytes(bytesToBase64(new ArrayBuffer(0)))!.byteLength).toBe(0);
  });

  it('refuses text that is not base64', () => {
    expect(base64ToBytes('abc')).toBeNull();
    expect(base64ToBytes('ab$=')).toBeNull();
    expect(base64ToBytes('<script>')).toBeNull();
  });
});
