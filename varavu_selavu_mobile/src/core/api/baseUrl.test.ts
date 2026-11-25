import { getApiBaseUrl } from './baseUrl';
import { defaultAppConfig, setAppConfig } from '../config/appConfig';

const PROD = 'https://api.example.test';
const globals = global as unknown as { __DEV__: boolean };
const realDev = globals.__DEV__;
// Expo's babel preset rewrites `process.env.EXPO_PUBLIC_*` reads to a module-level reference to the
// original `process.env` object, so mutate that object in place; never replace `process.env`.
const KEYS = ['EXPO_PUBLIC_APP_VARIANT', 'EXPO_PUBLIC_API_URL'] as const;
const realEnv = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function build({ dev, variant, url }: { dev: boolean; variant?: string; url?: string }) {
  globals.__DEV__ = dev;
  if (variant === undefined) delete process.env.EXPO_PUBLIC_APP_VARIANT;
  else process.env.EXPO_PUBLIC_APP_VARIANT = variant;
  if (url === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = url;
}

beforeEach(() => {
  setAppConfig({ ...defaultAppConfig, api: { baseUrl: PROD, timeoutOverrides: [] } });
});

afterEach(() => {
  globals.__DEV__ = realDev;
  for (const k of KEYS) {
    if (realEnv[k] === undefined) delete process.env[k];
    else process.env[k] = realEnv[k];
  }
  setAppConfig(defaultAppConfig);
});

describe('getApiBaseUrl', () => {
  test('a production build ignores the URL override', () => {
    build({ dev: false, url: 'http://localhost:8080' });
    expect(getApiBaseUrl()).toBe(PROD);
  });

  test('a production build ignores the override even when a different variant name is set', () => {
    build({ dev: false, variant: 'staging', url: 'http://localhost:8080' });
    expect(getApiBaseUrl()).toBe(PROD);
  });

  test('a development build still honours the override (existing behaviour)', () => {
    build({ dev: true, url: 'http://192.168.1.20:8080' });
    expect(getApiBaseUrl()).toBe('http://192.168.1.20:8080');
  });

  test('a development build without an override uses the configured URL', () => {
    build({ dev: true });
    expect(getApiBaseUrl()).toBe(PROD);
  });

  describe('e2e variant in a non-development build', () => {
    test.each([
      'http://localhost:8080',
      'http://127.0.0.1:18080',
      'http://10.0.2.2:8080',
    ])('uses the local test backend %s', (url) => {
      build({ dev: false, variant: 'e2e', url });
      expect(getApiBaseUrl()).toBe(url);
    });

    test('refuses a missing URL instead of falling back to production', () => {
      build({ dev: false, variant: 'e2e' });
      expect(() => getApiBaseUrl()).toThrow(/e2e/i);
    });

    test.each([
      PROD,
      'https://localhost:8080',
      'http://localhost',
      'http://localhost:8080/',
      'http://localhost:8080/api',
      'http://localhost.evil.test:8080',
      'http://10.0.2.2.evil.test:8080',
      'http://user@localhost:8080',
      'http://192.168.1.20:8080',
      '',
    ])('refuses a URL that is not a local test backend: %p', (url) => {
      build({ dev: false, variant: 'e2e', url });
      expect(() => getApiBaseUrl()).toThrow(/e2e/i);
    });
  });
});
