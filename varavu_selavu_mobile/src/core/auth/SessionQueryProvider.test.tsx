import React from 'react';
import { act, render } from '@testing-library/react-native';
import { QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import SessionQueryProvider from './SessionQueryProvider';

let mockToken: string | null = 'token-a';
jest.mock('./AuthContext', () => ({ useAuth: () => ({ accessToken: mockToken }) }));

let current: QueryClient;
let save: () => void;
let finishSave: (note: string) => void;

/** Stands in for the signed-in tree: it reads the session's client and can start a save that finishes later. */
function SignedIn() {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => new Promise<string>((resolve) => { finishSave = resolve; }),
    onSuccess: (note) => client.setQueryData(['notes', 'detail', '1'], note),
  });
  save = () => mutation.mutate();
  return null;
}

function Probe() {
  current = useQueryClient();
  return mockToken ? <SignedIn /> : null;
}

const created: QueryClient[] = [];
function setup() {
  const tree = () => <SessionQueryProvider><Probe /></SessionQueryProvider>;
  const view = render(tree());
  created.push(current);
  return { rerender: () => { view.rerender(tree()); created.push(current); }, unmount: view.unmount };
}

// Fake timers: a finished mutation schedules a 5-minute cache cleanup that would otherwise keep Jest alive.
beforeEach(() => { jest.useFakeTimers(); mockToken = 'token-a'; });
afterEach(() => {
  while (created.length) created.pop()!.clear();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('SessionQueryProvider', () => {
  // Query keys need not include the user, so anything left cached would be shown to the next account on this device.
  // Explicit and forced (401) sign-out both end with no access token.
  it('gives the next account an empty cache and drops the previous one', () => {
    const { rerender } = setup();
    const first = current;
    first.setQueryData(['notes', 'list', { q: '' }], [{ title: 'private to A' }]);
    mockToken = null;
    rerender();
    mockToken = 'token-b';
    rerender();
    expect(current).not.toBe(first);
    expect(current.getQueryCache().getAll()).toHaveLength(0);
    expect(first.getQueryCache().getAll()).toHaveLength(0);
  });

  it("keeps a save that finishes after sign-out away from the next account's cache", async () => {
    const { rerender } = setup();
    await act(async () => { save(); });
    mockToken = null;
    rerender();
    await act(async () => { finishSave('private to A'); });
    mockToken = 'token-b';
    rerender();
    expect(current.getQueryData(['notes', 'detail', '1'])).toBeUndefined();
  });

  it('keeps the cache while signed in, including when the token changes, and from signed-out to signed-in', () => {
    mockToken = null;
    const { rerender } = setup();
    const signedOut = current;
    mockToken = 'token-a';
    rerender();
    current.setQueryData(['notes'], ['kept']);
    mockToken = 'token-a2';
    rerender();
    expect(current).toBe(signedOut);
    expect(current.getQueryData(['notes'])).toEqual(['kept']);
  });
});
