import * as fs from 'fs';
import * as path from 'path';
import { healthz, AuthedApi } from '../helpers/api.helper';
import { env } from '../helpers/env';
import { QA_USERS } from '../fixtures/users.fixture';
import { sweepQaData } from '../helpers/cleanup.helper';

/**
 * Runs once after the whole run. See cleanup.helper.ts for why this is best-effort.
 * Deliberately reuses the storageState files `auth.setup.ts` already produced instead of
 * calling AuthedApi.login() again — POST /auth/login is rate-limited to 5/minute, and a
 * fresh login here (on top of every real-login test) has caused avoidable 429s.
 */
export default async function globalTeardown(): Promise<void> {
  const up = await healthz(env.API_BASE_URL);
  if (!up) return;

  for (const persona of Object.values(QA_USERS)) {
    const storageStatePath = path.resolve(__dirname, '..', '..', persona.storageStatePath);
    if (!fs.existsSync(storageStatePath)) continue; // `setup` project never ran (e.g. api-only run)
    try {
      const api = await AuthedApi.fromStorageState(storageStatePath);
      await sweepQaData(api);
      await api.dispose();
    } catch (e) {
      console.warn(`[global.teardown] could not clean up for ${persona.email}: ${e}`);
    }
  }
}
