/**
 * Minimal logger for core code.
 *  - Silent in production builds (`__DEV__` false).
 *  - Never prints URLs, tokens or response bodies: arguments are reduced to strings, numbers and
 *    Error name/message (no stacks, no objects), and anything URL-shaped is replaced with `[url]`.
 *    Callers should still avoid passing secrets; this is a backstop, not permission.
 */
const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;

function safe(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`.replace(URL_PATTERN, '[url]');
  if (typeof arg === 'string') return arg.replace(URL_PATTERN, '[url]');
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
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
