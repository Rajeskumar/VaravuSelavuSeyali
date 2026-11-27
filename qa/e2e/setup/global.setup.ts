import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { healthz, ensureUserRegistered } from '../helpers/api.helper';
import { env } from '../helpers/env';
import { QA_USERS, QA_SESSION_USER, QA_DISPOSABLE_USER, QA_RESET_USER } from '../fixtures/users.fixture';
import { RUN_ID } from '../helpers/test-data.helper';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const BACKEND_DIR = path.join(REPO_ROOT, 'varavu_selavu_app');
const VERIFY_SCRIPT = path.resolve(__dirname, '..', '..', 'scripts', 'verify_qa_users.py');
const SESSION_USER_SCRIPT = path.resolve(__dirname, '..', '..', 'scripts', 'provision_qa_session_user.py');

// `npm run qa:smoke` and `npm run qa:regression` (and :api/:mobile/:e2e) are separate
// `playwright test` processes, each of which runs globalSetup once — but within one CI job
// they all share the same RUN_ID (derived from GITHUB_RUN_ID). Without this marker, every
// one of those invocations would re-hit POST /auth/register, and that endpoint is limited
// to 5/hour — a handful of npm scripts in one job would exhaust it before the tests that
// actually exercise registration (registration.spec.ts) get to run. The marker makes
// provisioning a true once-per-run-id operation regardless of how many scripts run.
const MARKER_PATH = path.resolve(__dirname, '..', '..', '.qa-provisioned', `${RUN_ID}.json`);

export default async function globalSetup(): Promise<void> {
  const up = await healthz(env.API_BASE_URL);
  if (!up) {
    console.warn(
      `[global.setup] API_BASE_URL (${env.API_BASE_URL}) is not reachable — skipping QA user ` +
        `provisioning. This is fine for a prod-smoke-only run; any other suite will fail fast ` +
        `once it tries to log in.`,
    );
    return;
  }

  if (fs.existsSync(MARKER_PATH)) {
    console.log(`[global.setup] QA personas already provisioned for run ${RUN_ID} — skipping.`);
    return;
  }

  for (const persona of Object.values(QA_USERS)) {
    await ensureUserRegistered(persona.name, persona.email, persona.password);
  }

  markVerified(Object.values(QA_USERS).map((p) => p.email));
  provisionSessionUser();
  provisionSessionUser(QA_DISPOSABLE_USER);
  provisionSessionUser(QA_RESET_USER);

  fs.mkdirSync(path.dirname(MARKER_PATH), { recursive: true });
  fs.writeFileSync(MARKER_PATH, JSON.stringify({ runId: RUN_ID, at: new Date().toISOString() }));
  console.log(`[global.setup] QA personas ready (${Object.keys(QA_USERS).join(', ')})`);
}

/**
 * A freshly registered user has `email_verified=false`, and `GroupService.require_verified_email`
 * blocks every group action on that (real login normally verifies by clicking an emailed
 * link — QA deliberately runs with no real SMTP). There's no HTTP-level way around this, so
 * this reaches into the database directly via qa/scripts/verify_qa_users.py, the same
 * accommodation the backend's own pytest suite makes for itself (tests/conftest.py's
 * email_verified-defaults-True insert listener) — see that script's docstring.
 *
 * Requires QA_DATABASE_URL (or DATABASE_URL) to point at the same database the backend
 * under test is using. Without it, this logs a warning and continues — every suite except
 * group tests still works fine, and group tests will fail with a clear 403 explaining why
 * rather than this step failing the whole run.
 */
function markVerified(emails: string[]): void {
  if (!process.env.QA_DATABASE_URL && !process.env.DATABASE_URL) {
    console.warn(
      '[global.setup] QA_DATABASE_URL/DATABASE_URL not set — QA personas will remain email-unverified ' +
        'and every group test will fail with 403 "Verify your email address...". Set QA_DATABASE_URL ' +
        'to the same Postgres the backend under test uses. See qa/README.md.',
    );
    return;
  }
  try {
    execFileSync('poetry', ['run', 'python', VERIFY_SCRIPT, ...emails], {
      cwd: BACKEND_DIR,
      stdio: 'inherit',
      env: process.env,
    });
  } catch (e) {
    const errType = e instanceof Error ? e.name : 'Error';
    console.warn(`[global.setup] failed to mark QA personas email-verified — group tests will 403 (${errType})`);
  }
}

/**
 * Creates QA_SESSION_USER, the account only the logout tests use (see its note in
 * fixtures/users.fixture.ts), straight in the QA database so it costs none of the
 * 5/hour registration budget. Same QA_DATABASE_URL requirement as markVerified; without
 * it, smoke.spec.ts and session.spec.ts fail at login ("incorrect email or password").
 */
function provisionSessionUser(user: { email: string; name: string; password: string } = QA_SESSION_USER): void {
  if (!process.env.QA_DATABASE_URL && !process.env.DATABASE_URL) {
    console.warn(
      '[global.setup] QA_DATABASE_URL/DATABASE_URL not set — skipping QA session user provisioning; ' +
        'the smoke test and session.spec.ts will fail to log in. See qa/README.md.',
    );
    return;
  }
  try {
    execFileSync('poetry', ['run', 'python', SESSION_USER_SCRIPT, user.email, user.name], {
      cwd: BACKEND_DIR,
      stdio: 'inherit',
      env: { ...process.env, QA_SESSION_PASSWORD: user.password },
    });
  } catch (e) {
    const errType = e instanceof Error ? e.name : 'Error';
    console.warn(`[global.setup] failed to create the QA session user — the logout tests will fail to log in (${errType})`);
  }
}
