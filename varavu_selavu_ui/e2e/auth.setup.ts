import { test as setup } from '@playwright/test';
import { AUTH_STATE_PATH, login } from './helpers';

/**
 * Logs in once and saves the storage state (cookie jar + localStorage) for every
 * other test to reuse.
 *
 * Necessary as well as faster: /auth/login is rate-limited to 5/minute, so a
 * suite that logged in per test would start getting 429s partway through.
 */
setup('authenticate', async ({ page }) => {
  await login(page);
  await page.context().storageState({ path: AUTH_STATE_PATH });
});
