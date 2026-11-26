import * as SecureStore from 'expo-secure-store';
import { advanceSession, runTokenWrite, sessionGuard, writeTokensIfSession } from './session';

// SecureStore whose writes can be held open, to interleave a sign-out between the check and the two writes.
const mockData = new Map<string, string>();
let mockGate: Promise<void> | null = null;
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockData.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { if (mockGate) await mockGate; mockData.set(key, value); }),
  deleteItemAsync: jest.fn(async (key: string) => { mockData.delete(key); }),
}));

beforeEach(() => { mockData.clear(); mockGate = null; });

describe('session guard', () => {
  it('stays valid until the session ends, however many times tokens are refreshed', () => {
    const guard = sessionGuard();
    // A refresh rewrites tokens but is not a session change: nothing advances the session.
    expect(guard()).toBe(true);
    expect(sessionGuard()()).toBe(true);
  });

  it('ends on sign-out, and a same-user sign-in afterwards is a different session', () => {
    const guard = sessionGuard();
    advanceSession(); // sign-out
    advanceSession(); // the same user signs back in
    expect(guard()).toBe(false);
    expect(sessionGuard()()).toBe(true);
  });
});

describe('writeTokensIfSession', () => {
  it('writes both tokens while the session is current', async () => {
    const ok = await writeTokensIfSession(sessionGuard(), { accessToken: 'a2', refreshToken: 'r2' });
    expect(ok).toBe(true);
    expect([mockData.get('access_token'), mockData.get('refresh_token')]).toEqual(['a2', 'r2']);
  });

  it('writes nothing when the session ended before the write', async () => {
    const guard = sessionGuard();
    advanceSession();
    expect(await writeTokensIfSession(guard, { accessToken: 'a2', refreshToken: 'r2' })).toBe(false);
    expect(mockData.size).toBe(0);
  });

  it('leaves no tokens when sign-out happens between the check and the two writes', async () => {
    mockData.set('access_token', 'a1'); mockData.set('refresh_token', 'r1');
    let release!: () => void;
    mockGate = new Promise<void>((r) => { release = r; });
    const guard = sessionGuard();
    const write = writeTokensIfSession(guard, { accessToken: 'a2', refreshToken: 'r2' });
    await Promise.resolve(); await Promise.resolve(); // the check has passed; the first write is held open
    // Sign-out: the session ends at once, the deletes are queued behind the write in flight.
    advanceSession();
    const signOut = runTokenWrite(async () => {
      await SecureStore.deleteItemAsync('access_token');
      await SecureStore.deleteItemAsync('refresh_token');
    });
    // Give the deletes every chance to run while the write is held: only the queue may stop them.
    await new Promise((r) => setTimeout(r, 0));
    release();
    await Promise.all([write, signOut]);
    expect(mockData.size).toBe(0);
  });

  it("does not overwrite the next account's tokens", async () => {
    const guard = sessionGuard();
    advanceSession();
    await runTokenWrite(async () => { await SecureStore.setItemAsync('access_token', 'b1'); await SecureStore.setItemAsync('refresh_token', 'rb1'); });
    expect(await writeTokensIfSession(guard, { accessToken: 'a2', refreshToken: 'r2' })).toBe(false);
    expect([mockData.get('access_token'), mockData.get('refresh_token')]).toEqual(['b1', 'rb1']);
  });
});

describe('runTokenWrite', () => {
  it('runs tasks one at a time, in order, and a failing task does not block the next', async () => {
    const order: string[] = [];
    const slow = runTokenWrite(async () => { order.push('slow:start'); await new Promise((r) => setTimeout(r, 10)); order.push('slow:end'); });
    const failing = runTokenWrite(async () => { order.push('fail'); throw new Error('boom'); });
    const last = runTokenWrite(async () => { order.push('last'); return 7; });
    await expect(failing).rejects.toThrow('boom');
    expect(await last).toBe(7);
    await slow;
    expect(order).toEqual(['slow:start', 'slow:end', 'fail', 'last']);
  });
});

describe('runTokenWrite with a stalled task', () => {
  afterEach(() => { jest.useRealTimers(); });

  it('lets later token writes (sign-in, sign-out) go ahead once a task has stalled past its budget', async () => {
    jest.useFakeTimers();
    runTokenWrite(() => new Promise<void>(() => { /* a keychain call that never answers */ }));
    let ran = false;
    const next = runTokenWrite(async () => { ran = true; });
    await jest.advanceTimersByTimeAsync(1_000);
    expect(ran).toBe(false); // still waiting its turn behind a task that may yet finish
    await jest.advanceTimersByTimeAsync(10_000);
    await next;
    expect(ran).toBe(true);
  });
});
