import { logger } from '../logger';
import { AnalyticsProvider, EventTable, Operation } from './types';
import { validateEvent } from './validate';

const OPERATION_TTL_MS = 30 * 60_000;
const MAX_OPERATIONS = 1000;
const SCREEN_EVENT = 'screen_view';

export interface AnalyticsClientOptions {
  /** Missing provider = disabled client. */
  provider: AnalyticsProvider | undefined;
  events: EventTable;
  platform: 'ios' | 'android';
  product: string;
  appVersion?: string;
  /** Events of one family share one terminal outcome per operation. Default: the event name. */
  terminalFamily?: (eventName: string) => string;
  /** App rules the schema alone can't express (e.g. outcome/error_code consistency). */
  invariant?: (name: string, result: Record<string, string>) => boolean;
  now?: () => number;
  /** Called with the event NAME after an event was accepted (e.g. for crash breadcrumbs). */
  onTracked?: (eventName: string) => void;
}

/**
 * Consent-gated, fail-safe analytics. No domain object ever enters: callers pass closed-enum
 * properties only, validated against the app's table. Every provider call is fire-and-forget and
 * isolated, so analytics can never change what the product does.
 */
export function createAnalyticsClient(options: AnalyticsClientOptions) {
  const { provider, events, platform, product, appVersion, now = () => Date.now() } = options;
  const family = options.terminalFamily ?? ((name: string) => name);
  let granted = false;
  // null until the first answer; it is always pushed to the SDK (even a denial) so a stale persisted native
  // setting is reconciled at every launch.
  let applied: boolean | null = null;
  let generation = 0;
  let lastScreen: string | null = null;
  const attempts = new Map<object, { generation: number; created: number; sent: Set<string> }>();

  const safely = (fn: () => void | Promise<void>) => {
    try {
      const result = fn();
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => logger.warn('analytics provider rejected'));
      }
    } catch {
      logger.warn('analytics provider failed');
    }
  };
  const permitted = () => granted && !!provider;

  const reset = () => {
    generation++;
    attempts.clear();
    lastScreen = null;
    if (provider) safely(() => provider.resetIdentity());
  };

  return {
    /** `true` after the user opts in, `false` on withdrawal. Withdrawal also forgets the identity. */
    setConsent(value: boolean) {
      if (value === applied) return;
      const wasGranted = granted;
      applied = value;
      granted = value;
      if (provider) safely(() => provider.setCollectionEnabled(value));
      if (!value && wasGranted) reset();           // withdrawal: forget the identity and in-flight work
      else { generation++; attempts.clear(); }     // first answer or grant: invalidate anything begun before it
    },
    isEnabled: () => permitted(),
    /** Sign-out, forced sign-out and account change: forget identity and in-flight operations. */
    resetIdentity: reset,
    /** Allocate before a request. Operations begun while consent is off can never emit later. */
    beginOperation(): Operation {
      const time = now();
      for (const [key, entry] of attempts) if (time - entry.created >= OPERATION_TTL_MS) attempts.delete(key);
      if (attempts.size >= MAX_OPERATIONS) attempts.delete(attempts.keys().next().value as object);
      const token = {};
      if (permitted()) attempts.set(token, { generation, created: time, sent: new Set() });
      return { generation, token };
    },
    track(name: string, properties: Record<string, string>, operation?: Operation): boolean {
      try {
        if (!permitted() || !provider || name === SCREEN_EVENT) return false;
        const check = options.invariant;
        const validated = validateEvent(events, name, properties, check ? (r) => check(name, r) : undefined);
        if (!validated) return false;
        if (operation) {
          const entry = attempts.get(operation.token);
          if (!entry || entry.generation !== generation || operation.generation !== generation
            || now() - entry.created >= OPERATION_TTL_MS) return false;
          const key = family(name);
          if (entry.sent.has(key)) return false;
          entry.sent.add(key);
        }
        const params = { ...validated, product, platform, feature: events[name].feature,
          ...(appVersion ? { app_version: appVersion } : {}) };
        safely(() => provider.logEvent(name, params));
        safely(() => options.onTracked?.(name));
        return true;
      } catch {
        return false;
      }
    },
    /** One event per screen change; a repeat of the current screen is ignored. Unknown ids are dropped. */
    trackScreen(screenName: string): boolean {
      try {
        if (!permitted() || !provider) return false;
        if (!validateEvent(events, SCREEN_EVENT, { screen_name: screenName })) return false;
        if (screenName === lastScreen) return false;
        lastScreen = screenName;
        safely(() => provider.logScreen(screenName));
        return true;
      } catch {
        return false;
      }
    },
  };
}
export type AnalyticsClient = ReturnType<typeof createAnalyticsClient>;
