import { defineConfig } from '@playwright/test';
// Standalone synthetic browser tests: no .env, backend, auth setup or real collectors.
export default defineConfig({
  testDir: './analytics', timeout: 30_000, retries: 0, workers: 1,
  use: { browserName: 'chromium', serviceWorkers: 'block' },
  reporter: 'list', outputDir: './reports/analytics',
});
