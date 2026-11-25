import { AnalyticsConfig } from './config';
import { EventName, EventProperties, events, validateEvent } from './events';
import { isTrackable, routeForPath, safeReferrer } from './routes';
import { AnalyticsProvider, PageContext } from './providers/types';
export type ConsentChoice = 'granted' | 'denied';
export interface Operation { readonly generation: number; readonly token: object }

/** Domain state never enters this client. Raw paths are compared only locally, never sent.
 * Provider calls are fire-and-forget and isolated from application errors. */
export function createAnalyticsClient(config: AnalyticsConfig, provider: AnalyticsProvider, referrer = '', now = () => Date.now()) {
  let initialized = false;
  let consent: ConsentChoice | null = null;
  let started = false;
  let sealed = false;
  let generation = 0;
  let current: { path: string; authenticated: boolean } | null = null;
  let lastSentPath: string | null = null;
  let previous = safeReferrer(referrer, config.origin);
  let page: PageContext | null = null;
  const attempts = new Map<object, { generation: number; created: number; sent: Set<string> }>();
  const safely = (fn: () => void) => { try { fn(); } catch { /* Analytics must never affect the product. */ } };
  const permitted = () => initialized && config.enabled && consent === 'granted' && !sealed;
  const contextFor = (path: string): PageContext => {
    const route = routeForPath(path);
    return { page_location: config.origin + route.template, page_title: route.title,
      page_referrer: previous, route_template: route.template, route_id: route.id };
  };
  const emitPage = () => safely(() => {
    if (!current || !permitted()) return;
    const route = routeForPath(current.path);
    if (!isTrackable(route, current.authenticated) || current.path === lastSentPath) return;
    page = contextFor(current.path);
    if (!started) { provider.initialize(config, page); started = true; }
    provider.context(page);
    provider.track('page_view', { ...page, product: 'trackspense', platform: 'web', feature: 'navigation',
      ...(config.appVersion ? { app_version: config.appVersion } : {}) });
    lastSentPath = current.path;
    previous = page.page_location;
  });
  const clear = () => {
    generation++; attempts.clear(); lastSentPath = null; previous = ''; page = null;
    if (started) { sealed = true; safely(() => provider.resetIdentity()); }
  };
  return {
    initialize() { initialized = true; emitPage(); },
    setConsent(choice: ConsentChoice | null) {
      if (choice !== 'granted') {
        const shouldClear = consent === 'granted' || choice === 'denied';
        consent = choice;
        if (shouldClear) clear();
        return;
      }
      consent = 'granted'; emitPage();
    },
    /** No account User-ID in v1; even an opaque value is deliberately ignored. */
    identify(_identifier: unknown) {},
    resetIdentity: clear,
    disable() { sealed = true; clear(); safely(() => provider.disable()); },
    hasStarted: () => started,
    beginOperation(): Operation {
      const time = now();
      for (const [key, entry] of attempts) if (time - entry.created >= 30 * 60_000) attempts.delete(key);
      if (attempts.size >= 1000) attempts.delete(attempts.keys().next().value as object);
      const token = {};
      // Events begun before permission must never be replayed after opt-in.
      if (permitted()) attempts.set(token, { generation, created: time, sent: new Set() });
      return { generation, token };
    },
    track<N extends EventName>(name: N, properties: EventProperties<N>, operation?: Operation): boolean {
      try {
        if (!permitted() || !current || !page || !started || !isTrackable(routeForPath(current.path), current.authenticated)) return false;
        const validated = validateEvent(name, properties);
        if (!validated) return false;
        if (operation) {
          const entry = attempts.get(operation.token);
          if (!entry || entry.generation !== generation || operation.generation !== generation || now() - entry.created >= 30 * 60_000) return false;
          // A producer may pair a start with one terminal outcome. Every event emitted for
          // an operation must pass the same context, even through transport retries.
          const family = name === 'sign_up' || name === 'signup_failed' ? 'signup-terminal'
            : name === 'login' || name === 'login_failed' ? 'login-terminal'
            : name === 'category_suggestion_accepted' || name === 'category_suggestion_overridden' ? 'category-disposition'
            : name === 'expense_created' || name === 'group_expense_created' || name === 'expense_creation_failed'
            ? 'expense-terminal' : /_(completed|failed)$/.test(name) ? name.replace(/_(completed|failed)$/, '-terminal') : name;
          if (entry.sent.has(family)) return false;
          entry.sent.add(family);
        }
        provider.track(name, { ...validated, product: 'trackspense', platform: 'web',
          feature: events[name].feature, route_template: page.route_template, route_id: page.route_id,
          ...(config.appVersion ? { app_version: config.appVersion } : {}) });
        return true;
      } catch { return false; }
    },
    trackPageView(pathname: string, authenticated: boolean) {
      const path = pathname.split(/[?#]/)[0];
      // Keep sequence through suppressed/denied routes so revisits count, not history keys.
      if (current?.path !== path) lastSentPath = null;
      current = { path, authenticated };
      const route = routeForPath(path);
      if (!isTrackable(route, authenticated)) {
        page = null;
        if (route.excluded) { previous = ''; if (started) clear(); }
        return;
      }
      emitPage();
    },
    /** Called before history mutations, and by the earliest popstate listener. */
    prepareNavigation(pathname: string, authenticated: boolean) {
      safely(() => {
        const route = routeForPath(pathname);
        if (!isTrackable(route, authenticated)) {
          if (started) { sealed = true; provider.disable(); }
          previous = ''; page = null;
        } else if (started && permitted()) {
          provider.context(current?.path === pathname && page ? page : contextFor(pathname));
        }
      });
    },
  };
}
