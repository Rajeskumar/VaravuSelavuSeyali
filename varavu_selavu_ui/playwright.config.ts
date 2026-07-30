import { defineConfig, devices } from '@playwright/test';
import { AUTH_STATE_PATH } from './e2e/helpers';

/**
 * Responsive/mobile-rendering suite (P1-4).
 *
 * Assumes the CRA dev server and the API are already running (see e2e/README.md).
 * PLAYWRIGHT_BASE_URL overrides the app origin — CRA falls back to a random port
 * when 3000 is taken, so it often needs setting.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Logs in once; /auth/login is rate-limited, so tests reuse the cookie jar.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      // 375x812 — iPhone X/11 Pro/12 mini class, the narrowest mainstream phone.
      name: 'iPhone SE/X (375x812)',
      testIgnore: /auth\.setup\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        hasTouch: true,
        storageState: AUTH_STATE_PATH,
      },
    },
    {
      // 390x844 — iPhone 12/13/14 class.
      name: 'iPhone 13 (390x844)',
      testIgnore: /auth\.setup\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        storageState: AUTH_STATE_PATH,
      },
    },
  ],
});
