/**
 * PDF.js behind a small interface. Only this file imports it, and only when
 * a PDF is first opened, so the library is not part of the first download.
 *
 * PDF.js runs its parser in a worker served from this origin. Fonts that a
 * PDF names but does not embed, character maps for East Asian text, and the
 * image decoders are copied next to the app at build time (vite.config.ts),
 * so no file is fetched from anywhere else.
 */

export interface PdfPageSize {
  /** Width and height at 100 %, in CSS pixels. */
  width: number;
  height: number;
}

export interface PdfRender {
  done: Promise<void>;
  cancel: () => void;
}

export interface PdfDocument {
  pageCount: number;
  pageSize: (page: number) => Promise<PdfPageSize>;
  /** Paints a page into a canvas at a scale, sharp on high-density screens. */
  renderPage: (page: number, canvas: HTMLCanvasElement, scale: number) => PdfRender;
  /** Lays the page's text over it, invisible but selectable, in `container`. */
  renderText: (page: number, container: HTMLElement, scale: number) => PdfRender;
  destroy: () => void;
}

type PdfJs = typeof import('pdfjs-dist');

let library: Promise<PdfJs> | null = null;

async function loadLibrary(): Promise<PdfJs> {
  library ??= (async () => {
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })();
  return library;
}

/** Where the build puts PDF.js's data files. Ends with a slash, as PDF.js requires. */
const assets = (folder: string) => `${import.meta.env.BASE_URL}pdfjs/${folder}/`;

const cancelled = (error: unknown) => error instanceof Error && error.name === 'RenderingCancelledException';

/**
 * Opens a PDF from its bytes. The bytes are copied first: PDF.js hands its
 * buffer to the worker, which would empty the caller's.
 */
export async function openPdf(bytes: ArrayBuffer): Promise<PdfDocument> {
  const pdfjs = await loadLibrary();
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes.slice(0)),
    cMapUrl: assets('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: assets('standard_fonts'),
    wasmUrl: assets('wasm'),
    // PDFs may not run scripts or fill forms here: the reader only shows them.
    enableXfa: false,
  });
  const doc = await task.promise;

  return {
    pageCount: doc.numPages,
    pageSize: async (number) => {
      const page = await doc.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      return { width: viewport.width, height: viewport.height };
    },
    renderPage: (number, canvas, scale) => {
      let cancel = () => {};
      const done = (async () => {
        const page = await doc.getPage(number);
        const ratio = Math.min(window.devicePixelRatio || 1, 3);
        const viewport = page.getViewport({ scale: scale * ratio });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const task = page.render({ canvas, viewport });
        cancel = () => task.cancel();
        try {
          await task.promise;
        } catch (error) {
          if (!cancelled(error)) throw error;
        }
      })();
      return { done, cancel: () => cancel() };
    },
    renderText: (number, container, scale) => {
      let cancel = () => {};
      const done = (async () => {
        const page = await doc.getPage(number);
        const viewport = page.getViewport({ scale });
        container.replaceChildren();
        const layer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container, viewport });
        cancel = () => layer.cancel();
        try {
          await layer.render();
        } catch (error) {
          if (!cancelled(error)) throw error;
        }
      })();
      return { done, cancel: () => cancel() };
    },
    destroy: () => void task.destroy(),
  };
}
