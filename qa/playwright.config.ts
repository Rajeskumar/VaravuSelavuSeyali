import { defineConfig, devices } from '@playwright/test';
import { env } from './e2e/helpers/env';

// Playwright's `globalSetup` and each test file run in SEPARATE Node processes (workers
// are child processes, and each one re-imports this config file independently). Without
// this, e2e/helpers/test-data.helper.ts's RUN_ID (computed at module-load time, from
// Date.now()+random when GITHUB_RUN_ID is unset) would come out DIFFERENT in every
// process — global.setup.ts would register "qa.primary.<A>@..." in the main process while
// auth.setup.ts tried to log into "qa.primary.<B>@..." in a worker, and login would fail
// with a real "incorrect email or password" (reproduced while verifying this framework
// locally). Fixing it here, once, in the first file every process loads, before any file
// that reads RUN_ID gets imported, makes it one value for the whole `playwright test` run.
process.env.QA_RUN_ID = process.env.QA_RUN_ID || `${Date.now()}${Math.floor(Math.random() * 1000)}`;

// Default browser identity for every e2e project: the primary QA persona, logged in once
// by the `setup` project's auth.setup.ts. Tests that specifically need the secondary
// persona's own browser session (rare — most cross-user scenarios go through
// `secondaryApi` instead) open their own context with e2e/auth/secondary.json directly.
const PRIMARY_STORAGE_STATE = 'e2e/auth/primary.json';

/**
 * Single Playwright config for the whole QA framework — browser E2E, API, and the
 * strictly read-only prod smoke check all live here as separate projects rather than
 * separate config files, so `npx playwright test --project=X` is the one entry point.
 *
 * Retries: 0 locally (a flaky pass should never hide a real bug while iterating),
 * 1 on CI (network/timing noise on a shared runner) — still investigate anything that
 * only passes on retry, per the QA README.
 */
export default defineConfig({
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!env.IS_CI,
  retries: env.IS_CI ? 1 : 0,
  // Capped rather than left at Playwright's CPU-count default even locally: this suite's
  // tests share one real dev-mode backend + frontend (and, more importantly, one real
  // /auth/login rate limit — see the README) — full CPU-count parallelism against that
  // single shared stack caused real timeouts/flakiness verifying this framework locally
  // that disappeared at a lower cap.
  workers: env.IS_CI ? 2 : 4,
  globalSetup: require.resolve('./e2e/setup/global.setup.ts'),
  globalTeardown: require.resolve('./e2e/setup/global.teardown.ts'),
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html-report', open: 'never' }],
    ['junit', { outputFile: 'reports/junit/results.xml' }],
  ],
  outputDir: 'reports/test-results',
  use: {
    baseURL: env.BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testDir: './e2e/setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      // Depends on `setup` so api/tests can reuse the same storageState files as the browser
      // projects (AuthedApi.fromStorageState) instead of every API test logging in fresh —
      // /auth/login is rate-limited to 5/minute on the real backend.
      name: 'api',
      testDir: './api/tests',
      dependencies: ['setup'],
      use: { baseURL: env.API_BASE_URL },
    },
    {
      name: 'chromium',
      testDir: './e2e/tests',
      testIgnore: /prod-readonly\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: PRIMARY_STORAGE_STATE },
    },
    {
      name: 'firefox',
      testDir: './e2e/tests',
      testIgnore: /prod-readonly\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Firefox'], storageState: PRIMARY_STORAGE_STATE },
    },
    {
      name: 'webkit',
      testDir: './e2e/tests',
      testIgnore: /prod-readonly\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Safari'], storageState: PRIMARY_STORAGE_STATE },
    },
    {
      name: 'mobile-iphone',
      testDir: './e2e/tests',
      testIgnore: /prod-readonly\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 }, // iPhone 13-class — matches the migrated responsive suite
        hasTouch: true,
        storageState: PRIMARY_STORAGE_STATE,
      },
    },
    {
      // Never depends on `setup` — must never log in, must never write. See prod-readonly.spec.ts.
      name: 'prod-smoke',
      testDir: './e2e/tests/smoke',
      testMatch: /prod-readonly\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: env.PROD_BASE_URL },
    },
  ],
});
