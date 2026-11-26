import { resolveAnalyticsEnvironment } from './environment';

const r = (env: string | undefined, variant?: string, dev = false) => resolveAnalyticsEnvironment({ env, variant, dev });

test('production and qa need the explicit variable', () => {
  expect(r('production')).toBe('production');
  expect(r('qa')).toBe('qa');
});
test('unset, unknown and look-alike values are off', () => {
  for (const v of [undefined, '', 'prod', 'Production', 'staging', 'true', '1', 'development']) expect(r(v)).toBe('off');
});
test('a development build can never report to production, but may use qa', () => {
  expect(r('production', undefined, true)).toBe('off');
  expect(r('qa', undefined, true)).toBe('qa');
});
test('the native E2E variant is always off, whatever else is set', () => {
  expect(r('production', 'e2e')).toBe('off');
  expect(r('qa', 'e2e')).toBe('off');
});
