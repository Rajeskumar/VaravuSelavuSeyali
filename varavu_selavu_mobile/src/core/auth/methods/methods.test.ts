import { getEnabledAuthMethods } from './index';
import { setAppConfig, defaultAppConfig } from '../../config/appConfig';

afterEach(() => setAppConfig(defaultAppConfig));

test('returns the enabled methods in configured order', () => {
  setAppConfig({ ...defaultAppConfig, auth: { ...defaultAppConfig.auth, methods: ['password'] } });
  expect(getEnabledAuthMethods().map((m) => m.id)).toEqual(['password']);
});

test('returns nothing when the app enables no methods', () => {
  setAppConfig({ ...defaultAppConfig, auth: { ...defaultAppConfig.auth, methods: [] } });
  expect(getEnabledAuthMethods()).toEqual([]);
});
