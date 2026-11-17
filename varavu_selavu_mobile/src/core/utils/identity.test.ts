import { firstNameOf, initialOf } from './identity';

describe('identity', () => {
  it('prefers the first word of the profile name', () => {
    expect(firstNameOf('Rajesh Kumar', 'x@y.com')).toBe('Rajesh');
    expect(firstNameOf('  Priya  ', null)).toBe('Priya');
  });
  it('falls back to the email local part, then the fallback', () => {
    expect(firstNameOf('', 'rajesh.k@example.com')).toBe('rajesh.k');
    expect(firstNameOf(null, null)).toBe('there');
  });
  it('derives an uppercase initial', () => {
    expect(initialOf('rajesh', null)).toBe('R');
    expect(initialOf(null, 'zed@x.com')).toBe('Z');
    expect(initialOf(null, null, )).toBe('?');
  });
});
