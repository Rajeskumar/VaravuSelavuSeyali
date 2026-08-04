import { CSRF_HEADER, csrfHeader, needsCsrf, readCsrfToken } from './csrf';

function setCookie(value: string) {
  Object.defineProperty(document, 'cookie', { value, writable: true, configurable: true });
}

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

describe('needsCsrf', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'post'])('requires it for %s', (method) => {
    expect(needsCsrf(method)).toBe(true);
  });

  it.each(['GET', 'HEAD', 'OPTIONS', undefined])('does not require it for %s', (method) => {
    expect(needsCsrf(method)).toBe(false);
  });
});
