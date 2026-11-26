/**
 * AppConfig — everything product-specific that core needs to know, passed in by the app.
 * An app calls `setAppConfig(config)` once, before first render (see app/appConfig.ts).
 * Core code reads it lazily through `getAppConfig()`; it never imports an app or a feature.
 */
export type AuthMethodId = 'password';

export interface TimeoutOverride {
  /** Matched against the request path. */
  pattern: RegExp;
  ms: number;
}

export interface AppConfig {
  brand: {
    name: string;
    /** Sign-in screen headline: `lines` in the body colour, then `accent` in the secondary colour. */
    loginHeadline: { lines: string[]; accent: string };
    loginTagline: string;
  };
  api: {
    /** Backend origin. In development builds `EXPO_PUBLIC_API_URL` still takes precedence. */
    baseUrl: string;
    /** Per-path request budgets; anything unmatched gets the default (30 s). */
    timeoutOverrides: TimeoutOverride[];
  };
  auth: {
    /** Sign-in methods to offer, in display order. */
    methods: AuthMethodId[];
    /** Shown on the sign-in screen after a forced (401) sign-out. */
    sessionEndedNotice: string;
    /** The two paragraphs of the delete-account confirmation. */
    deleteAccountSummary: { deleted: string; retained: string };
  };
  notifications: {
    androidChannelName: string;
  };
  analytics: {
    /**
     * Navigation route name → the stable screen id reported to analytics. A route missing here is never
     * reported, so a new screen is invisible until it is registered (and its id is in the event catalog).
     */
    screens: Record<string, string>;
  };
}

/** Neutral defaults so core modules (and their tests) work before an app configures them. */
export const defaultAppConfig: AppConfig = {
  brand: { name: 'App', loginHeadline: { lines: [], accent: '' }, loginTagline: '' },
  api: { baseUrl: '', timeoutOverrides: [] },
  auth: {
    methods: ['password'],
    sessionEndedNotice: 'Your session ended. Sign in again to continue.',
    deleteAccountSummary: { deleted: '', retained: '' },
  },
  notifications: { androidChannelName: 'Notifications' },
  analytics: { screens: {} },
};

let current: AppConfig = defaultAppConfig;

export function setAppConfig(config: AppConfig): void {
  current = config;
}

export function getAppConfig(): AppConfig {
  return current;
}
