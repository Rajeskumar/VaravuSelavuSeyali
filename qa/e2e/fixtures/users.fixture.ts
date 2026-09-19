import { env } from '../helpers/env';
import { RUN_ID } from '../helpers/test-data.helper';

export interface QaPersona {
  key: 'primary' | 'secondary';
  name: string;
  email: string;
  password: string;
  storageStatePath: string;
}

/**
 * Two QA users, provisioned once per run (see setup/global.setup.ts) and reused
 * across every test via storageState — never logged in per-test, since
 * POST /auth/login is rate-limited to 5/minute per IP on the real backend.
 *
 * `primary` drives almost everything; `secondary` exists so group/invite/balance
 * tests have a real second account to add as a member and settle up with.
 */
export const QA_USERS: Record<'primary' | 'secondary', QaPersona> = {
  primary: {
    key: 'primary',
    name: 'QA Primary',
    email: `qa.primary.${RUN_ID}@trackspense.qa`,
    password: env.QA_USER_PASSWORD,
    storageStatePath: `e2e/auth/primary.json`,
  },
  secondary: {
    key: 'secondary',
    name: 'QA Secondary',
    email: `qa.secondary.${RUN_ID}@trackspense.qa`,
    password: env.QA_USER_PASSWORD,
    storageStatePath: `e2e/auth/secondary.json`,
  },
};
