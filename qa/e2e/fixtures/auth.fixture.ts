import { test as base } from '@playwright/test';
import * as path from 'path';
import { AuthedApi } from '../helpers/api.helper';
import { QA_USERS } from './users.fixture';

type AuthFixtures = {
  /** Authenticated API client for the primary QA persona (same identity the `chromium`/etc. projects log in as). */
  primaryApi: AuthedApi;
  /** Second QA persona — for anything that needs a real distinct counterpart (groups, invites, authorization checks). */
  secondaryApi: AuthedApi;
};

export const test = base.extend<AuthFixtures>({
  primaryApi: async ({}, use) => {
    const api = await AuthedApi.fromStorageState(path.resolve(__dirname, '..', 'auth', 'primary.json'));
    await use(api);
    await api.dispose();
  },
  secondaryApi: async ({}, use) => {
    const api = await AuthedApi.fromStorageState(path.resolve(__dirname, '..', 'auth', 'secondary.json'));
    await use(api);
    await api.dispose();
  },
});

export { expect } from '@playwright/test';
export { QA_USERS };
