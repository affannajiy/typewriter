import { readAttachmentBytes } from '@/database/repositories/attachments';
import { pdfsWithoutText, savePdfText } from '@/database/repositories/pdfTexts';
import type { Id } from '@/types/models';

/**
 * Reads the text of PDFs in the background, one at a time, so search can
 * find words inside them. Each PDF is read once; its text is stored.
 *
 * It starts when the browser is idle, so it never competes with typing.
 * PDF.js loads only when there is a PDF to read.
 */

let running = false;
let again = false;
/** PDFs that could not be read in this session (damaged, or no text layer at all): not tried twice. */
const failed = new Set<Id>();

const whenIdle = () =>
  new Promise<void>((resolve) => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => resolve(), { timeout: 5000 });
    else setTimeout(resolve, 200);
  });

async function readOne(id: Id): Promise<void> {
  const { openPdf } = await import('./pdf');
  const pdf = await openPdf(await readAttachmentBytes(id));
  try {
    await savePdfText(id, await pdf.extractText());
  } finally {
    pdf.destroy();
  }
}

async function run(): Promise<void> {
  do {
    again = false;
    const waiting = (await pdfsWithoutText()).filter((id) => !failed.has(id));
    for (const id of waiting) {
      await whenIdle();
      try {
        await readOne(id);
      } catch (error) {
        failed.add(id);
        console.error(error);
      }
    }
  } while (again);
}

/** Read every PDF that has no stored text yet. Safe to call often: one run at a time. */
export function indexPdfs(): void {
  if (running) {
    again = true;
    return;
  }
  running = true;
  void run()
    .catch((error: unknown) => console.error(error))
    .finally(() => {
      running = false;
    });
}
