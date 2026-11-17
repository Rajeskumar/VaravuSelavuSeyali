import { registerSignOutCleanup, runSignOutCleanups } from './signOutRegistry';

test('runs registered cleanups for the requested phase only, in registration order', async () => {
  const calls: string[] = [];
  registerSignOutCleanup(() => { calls.push('before-1'); }, 'before');
  registerSignOutCleanup(async () => { calls.push('before-2'); }, 'before');
  registerSignOutCleanup(() => { calls.push('after-1'); }, 'after');
  await runSignOutCleanups('before');
  expect(calls).toEqual(['before-1', 'before-2']);
  await runSignOutCleanups('after');
  expect(calls).toEqual(['before-1', 'before-2', 'after-1']);
});

test('a failing cleanup is swallowed and does not stop the others', async () => {
  const later = jest.fn();
  registerSignOutCleanup(() => { throw new Error('boom'); }, 'after');
  registerSignOutCleanup(later, 'after');
  await expect(runSignOutCleanups('after')).resolves.toBeUndefined();
  expect(later).toHaveBeenCalled();
});

test('registering the same cleanup twice runs it once', async () => {
  const once = jest.fn();
  registerSignOutCleanup(once, 'before');
  registerSignOutCleanup(once, 'before');
  await runSignOutCleanups('before');
  expect(once).toHaveBeenCalledTimes(1);
});
