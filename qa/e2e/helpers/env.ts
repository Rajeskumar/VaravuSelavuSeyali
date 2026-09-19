import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw.toLowerCase() === 'true';
}

export const env = {
  BASE_URL: process.env.BASE_URL || 'http://localhost:3000',
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:8080',
  PROD_BASE_URL: process.env.PROD_BASE_URL || 'https://expense.cerebroos.com',
  // The web app and API live on separate subdomains in prod (unlike local, where
  // BASE_URL/API_BASE_URL are just different ports) — confirmed by inspecting the deployed
  // bundle's baked-in REACT_APP_API_BASE_URL.
  PROD_API_BASE_URL: process.env.PROD_API_BASE_URL || 'https://trackspense-api.cerebroos.com',
  QA_USER_PASSWORD: process.env.QA_USER_PASSWORD || 'Qa_E2E_Passw0rd!',
  ALLOW_PROD_WRITES: readBool('ALLOW_PROD_WRITES', false),
  IS_CI: readBool('CI', false),
};

/**
 * Every write helper (register/create/update/delete) calls this first.
 * Keeps a mis-set BASE_URL/API_BASE_URL from ever mutating prod data —
 * the only way around it is the explicit, never-default ALLOW_PROD_WRITES flag.
 */
export function assertWritesAllowed(targetUrl: string): void {
  const isLocalLike = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i.test(targetUrl);
  if (isLocalLike || env.ALLOW_PROD_WRITES) return;
  throw new Error(
    `Refusing to write to "${targetUrl}": it doesn't look local and ALLOW_PROD_WRITES is not "true". ` +
    `This safeguard exists so QA runs can never accidentally mutate production data.`,
  );
}
