import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE = `http://localhost:${PORT}/typewriter/`;

// End-to-end tests run against the production build, so they also prove the
// GitHub Pages base path works.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Typewriter sounds are on by default since 0.8.0: every key typed in every journey synthesises
  // audio. With the whole suite running at once, journeys that type a lot need more than 30 s.
  timeout: 60_000,
  reporter: 'list',
  // The service worker caches the whole app (about 320 files) on a fresh browser's first visit.
  // Only the offline journey needs it; elsewhere it would only compete with the test for the machine.
  use: { baseURL: BASE, trace: 'retain-on-failure', serviceWorkers: 'block' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
