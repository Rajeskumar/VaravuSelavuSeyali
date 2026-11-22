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

/**
 * A third account used ONLY by the tests that log out (smoke.spec.ts, session.spec.ts).
 *
 * Logging out ends every access token issued to that account so far, on every device
 * (`users.token_valid_after`, set by `POST /auth/logout`). When those tests logged out
 * `primary`/`secondary`, they invalidated the shared storageState every other test reuses:
 * smoke's logout broke the whole regression run that follows it, and session.spec's broke
 * every later test using `secondary`. Nothing else may log in as this account.
 *
 * Deliberately NOT part of `QA_USERS`: global.setup.ts registers QA_USERS over HTTP and
 * auth.setup.ts logs each of them in, and both of those budgets are spent exactly (README,
 * "Real rate limits"). This account is created directly in the QA database instead
 * (global.setup.ts → scripts/provision_qa_session_user.py), so it costs no registration,
 * and it has no storageState: the two tests that use it log in fresh, as they already did.
 */
/**
 * A fourth, disposable account used ONLY by account-security.spec.ts, which changes its password
 * and then deletes it. Created straight in the QA database like QA_SESSION_USER, so it costs no
 * registration; the spec signs in once through the UI (one login, within the per-minute limit).
 */
export const QA_DISPOSABLE_USER = {
  name: 'QA Disposable',
  email: `qa.disposable.${RUN_ID}@trackspense.qa`,
  password: env.QA_USER_PASSWORD,
} as const;

export const QA_SESSION_USER = {
  name: 'QA Session',
  email: `qa.session.${RUN_ID}@trackspense.qa`,
  password: env.QA_USER_PASSWORD,
} as const;
