import { createReadStream, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

/**
 * Content Security Policy for the production build. The app is fully static
 * and talks to no server, so everything is limited to its own origin.
 * 'unsafe-inline' is allowed for styles only: user-chosen colours are applied
 * through style attributes. Dev is exempt because Vite's HMR needs inline scripts.
 * 'wasm-unsafe-eval' lets PDF.js compile its bundled image decoders
 * (WebAssembly only; JavaScript eval stays forbidden). Recordings play from
 * blob: URLs made from stored bytes.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'typenote-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
  };
}

/**
 * PDF.js data files: fonts a PDF names without embedding, character maps for
 * East Asian text, colour profiles and image decoders. Copied into the build
 * under pdfjs/, and served from node_modules in development, so the reader
 * never fetches anything from another site. The scripting sandbox
 * (quickjs) is left out: PDFs do not run scripts here.
 */
const PDFJS_ROOT = fileURLToPath(new URL('./node_modules/pdfjs-dist/', import.meta.url));
const PDFJS_FOLDERS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
const pdfjsFiles = () =>
  PDFJS_FOLDERS.flatMap((folder) =>
    readdirSync(join(PDFJS_ROOT, folder))
      .filter((name) => !name.toLowerCase().includes('quickjs'))
      .map((name) => ({ folder, name })),
  );

function pdfjsAssetsPlugin(base: string): Plugin {
  return {
    name: 'typenote-pdfjs-assets',
    configureServer(server) {
      const allowed = new Set(pdfjsFiles().map(({ folder, name }) => `${base}pdfjs/${folder}/${name}`));
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0] ?? '';
        if (!allowed.has(path)) return next();
        const [, folder, name] = path.slice(base.length).split('/');
        response.setHeader('Content-Type', name!.endsWith('.wasm') ? 'application/wasm' : name!.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        createReadStream(join(PDFJS_ROOT, folder!, name!)).pipe(response);
      });
    },
    generateBundle() {
      for (const { folder, name } of pdfjsFiles()) {
        this.emitFile({ type: 'asset', fileName: `pdfjs/${folder}/${name}`, source: readFileSync(join(PDFJS_ROOT, folder, name)) });
      }
    },
  };
}

// GitHub Pages serves the app under /<repository>/. Override with
// TYPENOTE_BASE=/ for a root deployment such as Vercel.
const base = process.env.TYPENOTE_BASE ?? '/typewriter/';

/**
 * Offline shell (Milestone 8). The service worker precaches the whole build,
 * PDF.js's data files included, so every screen and the PDF reader open with
 * no network. User data is in IndexedDB and never passes through the worker.
 * 'prompt': a new version waits until the person chooses to reload, so an
 * update never reloads the page in the middle of writing.
 */
function pwaPlugin(base: string) {
  return VitePWA({
    registerType: 'prompt',
    injectRegister: false,
    includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
    manifest: {
      id: base,
      name: 'TypeNote',
      short_name: 'TypeNote',
      description: 'Your personal digital writing atelier. Private, local-first notes.',
      lang: 'en',
      dir: 'ltr',
      start_url: base,
      scope: base,
      display: 'standalone',
      // The Classic theme's Ivory and Walnut (src/styles/tokens.css). The manifest cannot read CSS.
      background_color: '#f5f0e6',
      theme_color: '#795b43',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2,ttf,wasm,bcmap,pfb,icc}'],
      // Not .woff: every browser TypeNote supports uses .woff2. The PDF.js worker is about 1.3 MB.
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      navigateFallback: `${base}index.html`,
      cleanupOutdatedCaches: true,
    },
  });
}

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react(), tailwindcss(), cspPlugin(), pdfjsAssetsPlugin(base), pwaPlugin(base)],
  build: {
    // Fonts are always files: the Content Security Policy allows fonts from 'self' only, not data: URLs.
    // Without this, a font subset under 4 kB is inlined and then blocked.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/i.test(file) ? false : undefined),
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
