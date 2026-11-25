import { createCrashReporter, installFatalErrorSanitizer, installRejectionSanitizer, sanitizeError, CrashProvider } from './crash';

function recordingProvider() {
  const calls: unknown[][] = [];
  const provider: CrashProvider = {
    setCollectionEnabled: (b) => { calls.push(['collection', b]); },
    recordError: (e) => { calls.push(['error', { name: e.name, message: e.message, stack: e.stack }]); },
    log: (m) => { calls.push(['log', m]); },
    setAttribute: (k, v) => { calls.push(['attr', k, v]); },
    crash: () => { calls.push(['crash']); },
    deleteUnsentReports: () => { calls.push(['deleteUnsent']); },
  };
  return { provider, calls };
}
const attrs = { app_version: '1.2.3', build: '45', env: 'qa', platform: 'ios' };

describe('sanitizeError', () => {
  test('never carries the message, URLs, emails, amounts or ids', () => {
    const error = new TypeError('Cannot save $12.50 lunch for ada@example.test at https://api.example.test/groups/7f3a1c?token=SECRET');
    error.stack = 'TypeError: Cannot save $12.50 for ada@example.test\n    at save (https://api.example.test/groups/7f3a1c?token=SECRET:10:5)\n    at index.android.bundle:1:2345';
    const safe = sanitizeError(error);
    const text = JSON.stringify(safe);
    expect(text).not.toMatch(/ada@|12\.50|SECRET|example|7f3a1c|lunch/);
    expect(safe.name).toBe('TypeError');
    expect(safe.message).toBe('type_error');
    expect(safe.stack).toContain('at save');
    expect(safe.stack).toContain('index.android.bundle:1:2345');
  });
  test('unknown error names collapse to Error, so a custom name cannot smuggle data', () => {
    const error = new Error('x'); error.name = 'Failed for ada@example.test';
    expect(sanitizeError(error)).toMatchObject({ name: 'Error', message: 'error' });
  });
  test('non-error throwables and hostile objects are safe', () => {
    expect(sanitizeError('secret string').message).toBe('error');
    expect(sanitizeError(null).name).toBe('Error');
    const hostile = { get message() { throw new Error('boom'); }, get stack() { throw new Error('boom'); }, get name() { throw new Error('boom'); } };
    expect(() => sanitizeError(hostile)).not.toThrow();
    expect(JSON.stringify(sanitizeError({ message: 'ada@example.test' }))).not.toMatch(/ada@/);
  });
  test('stack length is bounded', () => {
    const error = new Error('x'); error.stack = 'Error\n' + '    at f (a.js:1:1)\n'.repeat(500);
    expect(sanitizeError(error).stack.split('\n').length).toBeLessThanOrEqual(41);
  });
});

describe('reporter consent and content', () => {
  test('nothing is recorded, logged or attributed before opt-in', () => {
    const { provider, calls } = recordingProvider();
    const r = createCrashReporter({ provider, attributes: attrs });
    r.recordError(new Error('x')); r.breadcrumb('expense_created');
    expect(calls).toEqual([]);
  });
  test('opt-in enables collection and sets only the four safe attributes', () => {
    const { provider, calls } = recordingProvider();
    const r = createCrashReporter({ provider, attributes: attrs });
    r.setConsent(true);
    expect(calls).toEqual([['collection', true], ['attr', 'app_version', '1.2.3'], ['attr', 'build', '45'], ['attr', 'env', 'qa'], ['attr', 'platform', 'ios']]);
  });
  test('attribute values that do not look like versions or fixed words are dropped', () => {
    const { provider, calls } = recordingProvider();
    const r = createCrashReporter({ provider, attributes: { app_version: 'ada@example.test', build: '<script>', env: 'staging-for-ada', platform: 'ios' } });
    r.setConsent(true);
    expect(calls).toEqual([['collection', true], ['attr', 'platform', 'ios']]);
  });
  test('withdrawal stops recording immediately', () => {
    const { provider, calls } = recordingProvider();
    const r = createCrashReporter({ provider, attributes: attrs });
    r.setConsent(true); r.setConsent(false);
    calls.length = 0;
    r.recordError(new Error('x')); r.breadcrumb('login');
    expect(calls).toEqual([]);
    expect(r.isEnabled()).toBe(false);
  });
  test('breadcrumbs are event names only, and anything else is dropped', () => {
    const { provider, calls } = recordingProvider();
    const r = createCrashReporter({ provider, attributes: attrs });
    r.setConsent(true); calls.length = 0;
    r.breadcrumb('expense_created');
    r.breadcrumb('Saved $12.50 for ada@example.test');
    r.breadcrumb('x'.repeat(80));
    expect(calls).toEqual([['log', 'expense_created']]);
  });
  test('recorded errors are sanitized before they reach the SDK', () => {
    const { provider, calls } = recordingProvider();
    const r = createCrashReporter({ provider, attributes: attrs });
    r.setConsent(true); calls.length = 0;
    r.recordError(new RangeError('balance 99.00 for ada@example.test'));
    expect(JSON.stringify(calls)).not.toMatch(/ada@|99\.00|balance/);
    expect(calls[0][0]).toBe('error');
  });
  test('a failing SDK never reaches the caller', () => {
    const boom = () => { throw new Error('sdk'); };
    const r = createCrashReporter({ provider: { setCollectionEnabled: boom, recordError: boom, log: boom, setAttribute: boom, crash: boom, deleteUnsentReports: boom }, attributes: attrs });
    expect(() => { r.setConsent(true); r.recordError(new Error('x')); r.breadcrumb('login'); r.setConsent(false); }).not.toThrow();
  });
  test('the first answer is always pushed to the SDK, and a denial discards reports written while consent was off', () => {
    const { provider, calls } = recordingProvider();
    const r = createCrashReporter({ provider, attributes: attrs });
    r.setConsent(false);                      // start-up: nothing stored, or a stored denial
    expect(calls).toEqual([['collection', false], ['deleteUnsent']]);
    r.setConsent(false);                      // no change, no churn
    expect(calls).toHaveLength(2);
    r.setConsent(true);
    expect(calls).not.toContainEqual(['deleteUnsent', 'x']);
    const afterGrant = calls.filter((c) => c[0] === 'deleteUnsent').length;
    r.setConsent(false);                      // withdrawal discards too
    expect(calls.filter((c) => c[0] === 'deleteUnsent').length).toBe(afterGrant + 1);
  });
  test('the test crash only exists in a qa build and only when collecting', () => {
    const qa = recordingProvider();
    const rq = createCrashReporter({ provider: qa.provider, attributes: attrs, environment: 'qa' });
    expect(rq.testCrash()).toBe(false);          // no consent yet
    rq.setConsent(true);
    expect(rq.testCrash()).toBe(true);
    const prod = recordingProvider();
    const rp = createCrashReporter({ provider: prod.provider, attributes: { ...attrs, env: 'production' }, environment: 'production' });
    rp.setConsent(true);
    expect(rp.testCrash()).toBe(false);
    expect(prod.calls.some((c) => c[0] === 'crash')).toBe(false);
  });
  test('no provider means a disabled reporter', () => {
    const r = createCrashReporter({ provider: undefined, attributes: attrs });
    r.setConsent(true);
    expect(r.isEnabled()).toBe(false);
  });
});

describe('fatal error sanitizer', () => {
  test('rewrites an uncaught error before the next handler sees it, only while collecting', () => {
    const seen: { message: string; name: string }[] = [];
    const g = { handler: ((e: Error) => { seen.push({ message: e.message, name: e.name }); }) as (e: Error, fatal?: boolean) => void };
    const errorUtils = { getGlobalHandler: () => g.handler, setGlobalHandler: (h: typeof g.handler) => { g.handler = h; } };
    let enabled = false;
    installFatalErrorSanitizer(errorUtils, () => enabled);
    const secret = new TypeError('balance for ada@example.test');
    g.handler(secret, true);
    expect(seen[0].message).toBe('balance for ada@example.test'); // gate says no (development builds keep their red box)
    enabled = true;
    g.handler(new TypeError('balance for ada@example.test'), true);
    expect(seen[1]).toEqual({ message: 'type_error', name: 'TypeError' });
  });
  test('thrown strings and other non-errors are replaced, not logged verbatim', () => {
    const seen: unknown[] = [];
    const g = { handler: ((e: unknown) => { seen.push(e); }) as (e: never, fatal?: boolean) => void };
    installFatalErrorSanitizer({ getGlobalHandler: () => g.handler as never, setGlobalHandler: (h) => { g.handler = h as never; } }, () => true);
    g.handler('ada@example.test owes 40.00' as never, true);
    expect(seen[0]).toBeInstanceOf(Error);
    expect(JSON.stringify([(seen[0] as Error).message, (seen[0] as Error).stack])).not.toMatch(/ada@|40\.00/);
  });
  test('fails closed: a frozen error or a non-Error object is replaced, never forwarded raw', () => {
    const seen: unknown[] = [];
    const g = { handler: ((e: unknown) => { seen.push(e); }) as (e: never, fatal?: boolean) => void };
    installFatalErrorSanitizer({ getGlobalHandler: () => g.handler as never, setGlobalHandler: (h) => { g.handler = h as never; } }, () => true);
    g.handler(Object.freeze(new TypeError('ada@example.test owes 40.00')) as never, true);
    g.handler({ toString: () => 'ada@example.test', message: 'x' } as never, true);
    for (const e of seen) {
      expect(e).toBeInstanceOf(Error);
      expect(JSON.stringify([(e as Error).message, (e as Error).stack])).not.toMatch(/ada@|40\.00/);
    }
    expect(seen).toHaveLength(2);
  });
  test('a missing ErrorUtils is harmless', () => {
    expect(() => installFatalErrorSanitizer(undefined, () => true)).not.toThrow();
  });
});

describe('rejection sanitizer', () => {
  test('replaces the SDK tracker so rejections reach the reporter, never raw', () => {
    let handler: ((id: number, e: unknown) => void) | undefined;
    const reported: unknown[] = [];
    installRejectionSanitizer({ enable: (o) => { handler = o.onUnhandled; } }, (e) => reported.push(e));
    handler?.(1, new Error('balance 99.00 for ada@example.test'));
    expect(reported).toHaveLength(1);
  });
  test('a missing tracker or a throwing reporter is harmless', () => {
    expect(() => installRejectionSanitizer(undefined, () => {})).not.toThrow();
    let handler: ((id: number, e: unknown) => void) | undefined;
    installRejectionSanitizer({ enable: (o) => { handler = o.onUnhandled; } }, () => { throw new Error('x'); });
    expect(() => handler?.(1, new Error('x'))).not.toThrow();
  });
});
