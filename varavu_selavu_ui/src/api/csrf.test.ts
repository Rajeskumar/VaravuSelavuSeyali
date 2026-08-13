import { CSRF_HEADER, csrfHeader, needsCsrf, readCsrfToken, setCsrfToken } from './csrf';

function setCookie(value: string) {
  Object.defineProperty(document, 'cookie', { value, writable: true, configurable: true });
}

// The in-memory token is module state — reset it so tests don't leak into
// each other regardless of order.
beforeEach(() => setCsrfToken(null));

describe('readCsrfToken', () => {
  it('reads the token when it is the only cookie', () => {
    setCookie('vs_csrf=abc123');
    expect(readCsrfToken()).toBe('abc123');
  });

  it('reads the token from among other cookies', () => {
    setCookie('foo=1; vs_csrf=abc123; bar=2');
    expect(readCsrfToken()).toBe('abc123');
  });

  it('does not match a cookie that merely ends with the name', () => {
    setCookie('not_vs_csrf=wrong');
    expect(readCsrfToken()).toBeNull();
  });

  it('url-decodes the value', () => {
    setCookie('vs_csrf=a%2Bb');
    expect(readCsrfToken()).toBe('a+b');
  });

  it('returns null when absent', () => {
    setCookie('other=1');
    expect(readCsrfToken()).toBeNull();
  });
});

describe('csrfHeader', () => {
  it('produces the header when a token exists', () => {
    setCookie('vs_csrf=tok');
    expect(csrfHeader()).toEqual({ [CSRF_HEADER]: 'tok' });
  });

  it('produces nothing when no token exists', () => {
    setCookie('');
    expect(csrfHeader()).toEqual({});
  });
});

describe('setCsrfToken (cross-origin fallback)', () => {
  it('prefers the in-memory token over the cookie', () => {
    setCookie('vs_csrf=from-cookie');
    setCsrfToken('from-memory');
    expect(readCsrfToken()).toBe('from-memory');
    expect(csrfHeader()).toEqual({ [CSRF_HEADER]: 'from-memory' });
  });

  it('falls back to the cookie when no in-memory token was ever set (same-origin)', () => {
    setCookie('vs_csrf=from-cookie');
    expect(readCsrfToken()).toBe('from-cookie');
  });

  it('falls back to the cookie when the in-memory token is cleared', () => {
    setCookie('vs_csrf=from-cookie');
    setCsrfToken('from-memory');
    setCsrfToken(null);
    expect(readCsrfToken()).toBe('from-cookie');
  });

  it('accepts undefined the same as null (matches an auth response with no csrf_token field)', () => {
    setCookie('vs_csrf=from-cookie');
    setCsrfToken('from-memory');
    setCsrfToken(undefined);
    expect(readCsrfToken()).toBe('from-cookie');
  });
});

describe('needsCsrf', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'post'])('requires it for %s', (method) => {
    expect(needsCsrf(method)).toBe(true);
  });

  it.each(['GET', 'HEAD', 'OPTIONS', undefined])('does not require it for %s', (method) => {
    expect(needsCsrf(method)).toBe(false);
  });
});
