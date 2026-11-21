import { AppConfig } from '../core/config/appConfig';

const BACKEND_URL = 'https://varavu-selavu-backend-952416556244.us-central1.run.app';

/** TrackSpense's values for everything core leaves configurable. */
export const trackSpenseConfig: AppConfig = {
  brand: {
    name: 'TrackSpense',
    loginHeadline: { lines: ['Every transaction,', 'every expense,'], accent: 'accounted for.' },
    loginTagline: 'Track what you spend, split what you share, and ask why it changed.',
  },
  api: {
    baseUrl: BACKEND_URL,
    // AI chat and receipt parsing are slow; everything else gets the 30 s default.
    timeoutOverrides: [{ pattern: /\/analysis\/chat|\/ingest\/receipt/, ms: 120_000 }],
  },
  auth: {
    methods: ['password'],
    sessionEndedNotice: 'Your session ended. Sign in again to recover your expense draft. Check Expenses if a save was in progress.',
    deleteAccountSummary: {
      deleted: 'your profile, personal expenses and receipt items, budgets, recurring templates, tags, cards and sign-ins.',
      retained: 'expenses you added to shared groups, with their descriptions and amounts, so everyone else\'s balances stay correct. Your name on them becomes "Anonymous User" and your email is removed. Download your data first (Account → Download all my data) if you want a copy.',
    },
  },
  notifications: { androidChannelName: 'Group activity' },
};
