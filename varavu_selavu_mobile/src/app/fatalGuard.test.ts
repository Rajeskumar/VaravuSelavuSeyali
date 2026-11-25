describe('early fatal guard', () => {
  afterEach(() => { (global as unknown as { __DEV__: boolean }).__DEV__ = true; delete (globalThis as { ErrorUtils?: unknown }).ErrorUtils; jest.resetModules(); });

  test('in a release build an error thrown before the app is configured is sanitized before the next handler', () => {
    (global as unknown as { __DEV__: boolean }).__DEV__ = false;
    const seen: Error[] = [];
    let handler: (e: Error, f?: boolean) => void = (e) => { seen.push(e); };
    (globalThis as { ErrorUtils?: unknown }).ErrorUtils = { getGlobalHandler: () => handler, setGlobalHandler: (h: typeof handler) => { handler = h; } };
    jest.isolateModules(() => { require('./fatalGuard'); });
    handler(new TypeError('balance for ada@example.test'), true);
    expect(seen[0].message).toBe('type_error');
    expect(JSON.stringify([seen[0].message, seen[0].stack])).not.toMatch(/ada@/);
  });
  test('a development build keeps its red box (no rewrite while not collecting)', () => {
    (global as unknown as { __DEV__: boolean }).__DEV__ = true;
    const seen: Error[] = [];
    let handler: (e: Error, f?: boolean) => void = (e) => { seen.push(e); };
    (globalThis as { ErrorUtils?: unknown }).ErrorUtils = { getGlobalHandler: () => handler, setGlobalHandler: (h: typeof handler) => { handler = h; } };
    jest.isolateModules(() => { require('./fatalGuard'); });
    handler(new TypeError('visible while developing'), true);
    expect(seen[0].message).toBe('visible while developing');
  });
});
