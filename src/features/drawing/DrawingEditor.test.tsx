import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/database/db';
import { getDrawing, saveDrawing } from '@/database/repositories/drawings';
import { createPage } from '@/database/repositories/pages';
import { DrawingEditor } from './DrawingEditor';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

/** jsdom has no layout, so the canvas is 0 wide and one screen pixel is one canvas unit. */
function draw(canvas: Element, from: [number, number], to: [number, number], pointerType = 'mouse') {
  const at = ([x, y]: [number, number]) => ({ clientX: x, clientY: y, pointerId: 1, pointerType, button: 0, buttons: 1 });
  fireEvent.pointerDown(canvas, at(from));
  for (let i = 1; i <= 5; i++) fireEvent.pointerMove(canvas, at([from[0] + ((to[0] - from[0]) * i) / 5, from[1] + ((to[1] - from[1]) * i) / 5]));
  fireEvent.pointerUp(canvas, at(to));
}

async function open(drawingId = 'd1') {
  const page = await createPage({ title: 'Sketch' });
  const onClose = vi.fn();
  render(<DrawingEditor drawingId={drawingId} pageId={page.id} onClose={onClose} />);
  const canvas = await screen.findByRole('img', { name: /Drawing canvas/ });
  return { page, onClose, canvas };
}

describe('the drawing editor', () => {
  it('draws a stroke, saves it, and says "Saved" only after the write', async () => {
    const { page, canvas } = await open();
    expect(canvas).toHaveAccessibleName('Drawing canvas, 0 strokes');
    // A new drawing has never been saved, so no save status is shown yet.
    expect(screen.queryByText(/Saved on this device/)).not.toBeInTheDocument();

    draw(canvas, [10, 10], [200, 120]);
    expect(canvas).toHaveAccessibleName('Drawing canvas, 1 stroke');
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    expect(await getDrawing('d1')).toBeUndefined();

    await screen.findByText(/Saved on this device/, undefined, { timeout: 3000 });
    const saved = await getDrawing('d1');
    expect(saved).toMatchObject({ pageId: page.id, strokes: [{ tool: 'pen', colour: 'ink', pen: false }] });
    expect(saved!.strokes[0]!.points.length).toBe(3 * 6);
  });

  it('uses the chosen tool, colour and width, and undo and redo work from buttons and keys', async () => {
    const { canvas } = await open();
    await userEvent.click(screen.getByRole('radio', { name: 'Highlighter' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Green' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Bold' }));
    draw(canvas, [10, 10], [300, 10], 'pen');
    const path = canvas.querySelector('path')!;
    expect(path.getAttribute('fill')).toBe('var(--tn-ink-green)');
    expect(path.getAttribute('fill-opacity')).toBe('0.4');

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(canvas).toHaveAccessibleName('Drawing canvas, 0 strokes');
    await userEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(canvas).toHaveAccessibleName('Drawing canvas, 1 stroke');
    fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true });
    expect(canvas).toHaveAccessibleName('Drawing canvas, 0 strokes');
    fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(canvas).toHaveAccessibleName('Drawing canvas, 1 stroke');
  });

  it('once a pen is used, a finger no longer draws', async () => {
    const { canvas } = await open();
    draw(canvas, [10, 10], [100, 10], 'pen');
    draw(canvas, [10, 50], [100, 50], 'touch');
    expect(canvas).toHaveAccessibleName('Drawing canvas, 1 stroke');
    expect(screen.getByText(/Pen detected/)).toBeInTheDocument();
  });

  it('selects with the lasso and deletes the selection with an undo', async () => {
    const { canvas } = await open();
    draw(canvas, [20, 20], [80, 20]);
    draw(canvas, [400, 400], [500, 400]);
    await userEvent.click(screen.getByRole('radio', { name: 'Select with a lasso' }));
    const at = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 });
    fireEvent.pointerDown(canvas, at(0, 0));
    for (const [x, y] of [[150, 0], [150, 100], [0, 100], [0, 5]] as const) fireEvent.pointerMove(canvas, at(x, y));
    fireEvent.pointerUp(canvas, at(0, 5));
    expect(screen.getByText(/1 stroke selected/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete selection' }));
    expect(canvas).toHaveAccessibleName('Drawing canvas, 1 stroke');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(canvas).toHaveAccessibleName('Drawing canvas, 2 strokes');
  });

  it('opens a stored drawing as it was, and Done writes before closing', async () => {
    const page = await createPage({ title: 'Sketch' });
    await saveDrawing('d1', page.id, { height: 800, strokes: [{ id: 's1', tool: 'pen', colour: 'blue', size: 6, pen: true, points: [1, 1, 0.5, 50, 50, 0.5] }] });
    const onClose = vi.fn();
    render(<DrawingEditor drawingId="d1" pageId={page.id} onClose={onClose} />);
    const canvas = await screen.findByRole('img', { name: 'Drawing canvas, 1 stroke' });
    expect(canvas.getAttribute('viewBox')).toBe('0 0 1000 800');

    await userEvent.click(screen.getByRole('button', { name: 'Add space below' }));
    expect(canvas.getAttribute('viewBox')).toBe('0 0 1000 1100');
    draw(canvas, [100, 100], [200, 200]);
    await act(() => userEvent.click(screen.getByRole('button', { name: 'Done' })));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(await getDrawing('d1')).toMatchObject({ height: 1100, rev: 2 });
    expect((await getDrawing('d1'))!.strokes).toHaveLength(2);
  });
});
