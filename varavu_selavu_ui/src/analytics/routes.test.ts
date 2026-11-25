import { routeForPath, safeReferrer } from './routes';

test.each([
  ['/groups/12345678', '/groups/:groupId'], ['/expenses/123', '/not-found'],
  ['/analysis?merchant=PRIVATE#email', '/analysis'], ['/groups/join/TOKEN', '/groups/join/:token'],
  ['/unknown/PRIVATE', '/not-found'], ['/GROUPS/a/', '/groups/:groupId'],
])('normalizes %s to the actual router template %s', (path, template) => {
  expect(routeForPath(path).template).toBe(template);
});
test.each(['/ai/connect/TOKEN', '/ai/approve/TOKEN', '/ai/reauth', '/%61i/approve/TOKEN', '/groups/join/TOKEN', '/reset-password?token=PRIVATE', '/verify-email', '/account/assistants', '/%ZZ'])('%s never collects', path => {
  expect(routeForPath(path).excluded).toBe(true);
});
test('referrers discard secrets, unapproved hosts and sensitive or unknown internal paths', () => {
  const origin = 'https://app.example.test';
  expect(safeReferrer(origin + '/groups/PRIVATE?q=SECRET', origin)).toBe(origin + '/groups/:groupId');
  for (const ref of [origin + '/reset-password?token=PRIVATE', origin + '/unknown/PRIVATE', 'https://private.example.test/email', 'https://user:pass@cerebroos.com/']) expect(safeReferrer(ref, origin)).toBe('');
  expect(safeReferrer('https://cerebroos.com/expense?SECRET', origin)).toBe('https://cerebroos.com/');
});
