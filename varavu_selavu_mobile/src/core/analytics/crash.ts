import { logger } from '../logger';

/** Everything a crash SDK must do. Calls may throw; the reporter isolates them. */
export interface CrashProvider {
  setCollectionEnabled(enabled: boolean): void | Promise<void>;
  recordError(error: Error): void | Promise<void>;
  log(message: string): void | Promise<void>;
  setAttribute(key: string, value: string): void | Promise<void>;
  /** Native test crash. */
  crash(): void;
  /** Crash reports are written to disk even while collection is off; discard them when consent is not granted. */
  deleteUnsentReports(): void | Promise<void>;
}

/** Only these error names ever leave the device; anything else is reported as plain `Error`. */
const SAFE_NAMES = new Set([
  'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError',
  'RequestError', 'ApiError', 'AiLimitError', 'AiConsentDeclined',
]);
const MAX_STACK_LINES = 40;
const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;
const EMAIL_PATTERN = /[^\s@()]+@[^\s@()]+/g;

const toCode = (name: string) => name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();

function readName(error: unknown): string {
  try {
    const name = (error as { name?: unknown } | null)?.name;
    return typeof name === 'string' && SAFE_NAMES.has(name) ? name : 'Error';
  } catch { return 'Error'; }
}

/**
 * What a crash report may contain about a handled or fatal JS error: a whitelisted name, a fixed code
 * (never the message) and the stack's FRAME lines with URLs and e-mail-like text removed. The first stack
 * line, which repeats the message, is dropped. Never throws.
 */
export function sanitizeError(error: unknown): { name: string; message: string; stack: string } {
  const name = readName(error);
  let stack = '';
  try {
    const raw = (error as { stack?: unknown } | null)?.stack;
    if (typeof raw === 'string') {
      stack = raw.split('\n')
        .filter((line) => /^\s+at\s/.test(line))
        .slice(0, MAX_STACK_LINES)
        .map((line) => line.replace(URL_PATTERN, '[url]').replace(EMAIL_PATTERN, '[redacted]'))
        .join('\n');
    }
  } catch { stack = ''; }
  return { name, message: toCode(name), stack: stack ? `${name}\n${stack}` : name };
}

function toSafeError(error: unknown): Error {
  const safe = sanitizeError(error);
  const out = new Error(safe.message);
  out.name = safe.name;
  out.stack = safe.stack;
  return out;
}

const ATTRIBUTE_RULES: Record<string, RegExp> = {
  app_version: /^v?\d{1,4}(\.\d{1,4}){0,3}$/,
  build: /^[0-9][0-9A-Za-z.\-]{0,19}$/,
  env: /^(production|qa)$/,
  platform: /^(ios|android)$/,
};
const BREADCRUMB = /^[a-z][a-z0-9_]{0,39}$/;

export interface CrashReporterOptions {
  provider: CrashProvider | undefined;
  /** Allowed keys: app_version, build, env, platform. Values that don't match a strict pattern are dropped. */
  attributes: Record<string, string | undefined>;
  environment?: 'production' | 'qa';
}

/** Consent-gated, sanitizing wrapper over a crash SDK. Nothing happens before opt-in. */
export function createCrashReporter(options: CrashReporterOptions) {
  const { provider, attributes, environment } = options;
  // null until the first answer is applied; the first answer is always pushed to the SDK, even a denial,
  // because the SDK persists its own setting across launches and may disagree with our consent store.
  let applied: boolean | null = null;
  const safely = (fn: () => void | Promise<void>) => {
    try {
      const result = fn();
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => logger.warn('crash provider rejected'));
      }
    } catch { logger.warn('crash provider failed'); }
  };
  return {
    setConsent(granted: boolean) {
      if (!provider || granted === applied) return;
      applied = granted;
      safely(() => provider.setCollectionEnabled(granted));
      // Reports captured while consent was off (or before a withdrawal) must never upload after a later grant.
      if (!granted) safely(() => provider.deleteUnsentReports());
      if (granted) {
        for (const key of Object.keys(ATTRIBUTE_RULES)) {
          const value = attributes[key];
          if (typeof value === 'string' && ATTRIBUTE_RULES[key].test(value)) safely(() => provider.setAttribute(key, value));
        }
      }
    },
    isEnabled: () => applied === true && !!provider,
    /** Handled errors (error boundary, caught failures). The message and any user data stay on the device. */
    recordError(error: unknown) {
      if (applied !== true || !provider) return;
      safely(() => provider.recordError(toSafeError(error)));
    },
    /** Event names only. */
    breadcrumb(eventName: string) {
      if (applied !== true || !provider || typeof eventName !== 'string' || !BREADCRUMB.test(eventName)) return;
      safely(() => provider.log(eventName));
    },
    /** QA builds only, and only while collecting. Returns whether a crash was triggered. */
    testCrash(): boolean {
      if (applied !== true || !provider || environment !== 'qa') return false;
      safely(() => provider.crash());
      return true;
    },
  };
}
export type CrashReporter = ReturnType<typeof createCrashReporter>;

type ErrorUtilsLike = { getGlobalHandler(): (e: Error, fatal?: boolean) => void; setGlobalHandler(h: (e: Error, fatal?: boolean) => void): void };

/**
 * React Native Firebase reports uncaught JS errors itself, with their message. This wraps the global handler so
 * that, while crash collection is on, the error is rewritten to its sanitized form BEFORE the SDK's handler
 * sees it. Install it after the SDK has installed its own handler.
 */
export function installFatalErrorSanitizer(errorUtils: ErrorUtilsLike | undefined, shouldSanitize: () => boolean): void {
  try {
    if (!errorUtils) return;
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, fatal) => {
      let forwarded = error;
      try {
        if (shouldSanitize()) {
          if (error instanceof Error) {
            const safe = sanitizeError(error);
            error.name = safe.name; error.message = safe.message; error.stack = safe.stack;
            // Assignment to a frozen or getter-only property is silently ignored in some modes: check it took.
            if (error.message !== safe.message || error.stack !== safe.stack) forwarded = toSafeError(error);
          } else {
            // The SDK logs `Unknown Error: ${value}` for thrown strings and other non-errors (and calls their toString).
            forwarded = toSafeError(error);
          }
        }
      } catch {
        // Fail closed: if the error could not be rewritten in place (frozen, getter-only), forward a safe copy.
        try { forwarded = toSafeError(error); } catch { forwarded = new Error('error'); }
      }
      previous(forwarded, fatal);
    });
  } catch { /* best-effort */ }
}

type RejectionTracking = { enable(options: { allRejections: boolean; onUnhandled: (id: number, error: unknown) => void }): void };

/**
 * The SDK also records every unhandled promise rejection (release builds) with its message. Replacing the
 * tracker's handler sends the sanitized form through the reporter instead, and only while collecting.
 * Install after the SDK has constructed (it enables its own tracker then).
 */
export function installRejectionSanitizer(tracking: RejectionTracking | undefined, report: (error: unknown) => void): void {
  try {
    tracking?.enable({ allRejections: true, onUnhandled: (_id, error) => { try { report(error); } catch { /* best-effort */ } } });
  } catch { /* best-effort */ }
}
