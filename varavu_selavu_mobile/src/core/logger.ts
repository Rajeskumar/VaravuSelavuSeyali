/**
 * Minimal privacy-safe logger for core code (TS-OBS-001 L15).
 *  - Silent in production builds (`__DEV__` false).
 *  - Never prints URLs, tokens, error messages, arbitrary objects or free-form PII/secrets:
 *    Errors are reduced to their bounded class name only (`Error`, `TypeError`, etc.),
 *    finite numbers and booleans are formatted, and everything else becomes `[omitted]`.
 */
const SAFE_TYPE_RE = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;

function safe(arg: unknown): string {
  if (arg instanceof Error) {
    return SAFE_TYPE_RE.test(arg.name) ? arg.name : 'Error';
  }
  if (typeof arg === 'number' && Number.isFinite(arg)) return String(arg);
  if (typeof arg === 'boolean') return String(arg);
  return '[omitted]';
}

function emit(method: 'log' | 'warn' | 'error', message: string, extra: unknown[]) {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console
  console[method](message, ...extra.map(safe));
}

export const logger = {
  info: (message: string, ...extra: unknown[]) => emit('log', message, extra),
  warn: (message: string, ...extra: unknown[]) => emit('warn', message, extra),
  error: (message: string, ...extra: unknown[]) => emit('error', message, extra),
};
