import { resolveConfig } from './config';
const env = { NODE_ENV: 'production', REACT_APP_ANALYTICS_ENV: 'production', REACT_APP_ANALYTICS_ENABLED: 'true', REACT_APP_ANALYTICS_CONFIG_VERIFIED: 'true', REACT_APP_GA4_MEASUREMENT_ID: 'G-TESTONLY01' };
const target = { origin: 'https://app.example.test', measurementId: 'G-TESTONLY01' };
const registry = { production: target };

test('ships disabled with no approved destinations, even with all environment flags set', () => {
  expect(resolveConfig(env, target.origin, {}).enabled).toBe(false);
});
test.each(['development', 'test'])('%s cannot enable real analytics', NODE_ENV => {
  expect(resolveConfig({ ...env, NODE_ENV }, target.origin, registry).enabled).toBe(false);
});
test('requires matching origin, approved ID and every enablement flag', () => {
  expect(resolveConfig(env, target.origin, registry).enabled).toBe(true);
  for (const key of Object.keys(env)) expect(resolveConfig({ ...env, [key]: undefined }, target.origin, registry).enabled).toBe(false);
  expect(resolveConfig(env, 'http://localhost:3000', registry).enabled).toBe(false);
  expect(resolveConfig({ ...env, REACT_APP_GA4_MEASUREMENT_ID: 'G-OTHERID01' }, target.origin, registry).enabled).toBe(false);
});
test('rejects the legacy shared stream and sharing a production ID with staging', () => {
  const old = { ...target, measurementId: 'G-0M1N9KSEW5' };
  expect(resolveConfig({ ...env, REACT_APP_GA4_MEASUREMENT_ID: old.measurementId }, old.origin, { production: old }).enabled).toBe(false);
  expect(resolveConfig({ ...env, REACT_APP_ANALYTICS_ENV: 'staging' }, target.origin, { ...registry, staging: target }).enabled).toBe(false);
});

test('DebugView mode is staging-only and requires its own approved destination', () => {
  const staging = { origin: 'https://stage.example.test', measurementId: 'G-STAGEONLY1' };
  expect(resolveConfig(env, target.origin, registry).debug).toBe(false);
  expect(resolveConfig({ ...env, REACT_APP_ANALYTICS_ENV: 'staging', REACT_APP_GA4_MEASUREMENT_ID: staging.measurementId },
    staging.origin, { ...registry, staging })).toMatchObject({ enabled: true, debug: true });
});

test('the configured TrackSpense production stream requires the exact origin and explicit activation', () => {
  const origin = 'https://expense.cerebroos.com';
  const production = { ...env, REACT_APP_GA4_MEASUREMENT_ID: 'G-X3QFP5HNK2' };
  expect(resolveConfig(production, origin)).toMatchObject({
    enabled: true, measurementId: 'G-X3QFP5HNK2', debug: false,
  });
  expect(resolveConfig({ ...production, REACT_APP_ANALYTICS_ENABLED: 'false' }, origin).enabled).toBe(false);
  expect(resolveConfig({ ...production, REACT_APP_ANALYTICS_CONFIG_VERIFIED: 'false' }, origin).enabled).toBe(false);
  expect(resolveConfig(production, 'https://cerebroos.com').enabled).toBe(false);
  expect(resolveConfig({ ...production, REACT_APP_GA4_MEASUREMENT_ID: 'G-LCDPWZ61JR' }, origin).enabled).toBe(false);
});
