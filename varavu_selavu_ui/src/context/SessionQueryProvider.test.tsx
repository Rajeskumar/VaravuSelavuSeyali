import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import SessionQueryProvider from './SessionQueryProvider';

let current: QueryClient;
let save: () => void;
let finishSave: (note: string) => void;

/** Stands in for the signed-in app: reads the session's client and can start a save that finishes later. */
function SignedIn() {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => new Promise<string>((resolve) => { finishSave = resolve; }),
    onSuccess: (note) => client.setQueryData(['groups', false], note),
  });
  save = () => mutation.mutate();
  return null;
}

// Like the real app, the signed-in screens are gone once the identity is (logout navigates to /login).
function Probe() {
  current = useQueryClient();
  return localStorage.getItem('vs_user') ? <SignedIn /> : null;
}

// The web keeps its display identity in localStorage and announces changes with this event (api/api.ts, App.tsx).
const setUser = (email: string | null) => act(() => {
  if (email) localStorage.setItem('vs_user', email); else localStorage.removeItem('vs_user');
  window.dispatchEvent(new Event('vs_auth_changed'));
});

const created: QueryClient[] = [];
beforeEach(() => { jest.useFakeTimers(); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => {
  while (created.length) created.pop()!.clear();
  jest.clearAllTimers();
  jest.useRealTimers();
});
const mount = () => { const view = render(<SessionQueryProvider><Probe /></SessionQueryProvider>); created.push(current); return view; };

describe('SessionQueryProvider (web)', () => {
  // Query keys such as ['groups', false] and ['cards-mine'] do not include the user, so anything left cached would be shown
  // to the next account that signs in in the same tab.
  it('gives the next account an empty cache and drops the previous one on logout and forced logout', async () => {
    localStorage.setItem('vs_user', 'a@example.test');
    mount();
    const first = current;
    first.setQueryData(['groups', false], [{ name: 'private to A' }]);
    await setUser(null); // logout, or the 401 forceLogout, which removes the same key
    await setUser('b@example.test');
    expect(current).not.toBe(first);
    expect(current.getQueryData(['groups', false])).toBeUndefined();
    expect(first.getQueryCache().getAll()).toHaveLength(0);
  });

  it("keeps a save that finishes after logout away from the next account's cache", async () => {
    localStorage.setItem('vs_user', 'a@example.test');
    mount();
    await act(async () => { save(); });
    await setUser(null);
    await act(async () => { finishSave('private to A'); });
    await setUser('b@example.test');
    expect(current.getQueryData(['groups', false])).toBeUndefined();
  });

  it('replaces the cache when another tab switches straight to a different account', async () => {
    localStorage.setItem('vs_user', 'a@example.test');
    mount();
    const first = current;
    first.setQueryData(['cards-mine'], ['A card']);
    await setUser('b@example.test');
    expect(current).not.toBe(first);
    expect(current.getQueryData(['cards-mine'])).toBeUndefined();
  });

  it('keeps the cache while signed in, and from signed-out to signed-in', async () => {
    mount();
    const signedOut = current;
    await setUser('a@example.test');
    expect(current).toBe(signedOut);
    current.setQueryData(['groups', false], ['kept']);
    await setUser('a@example.test'); // the same account announced again
    expect(current).toBe(signedOut);
    expect(current.getQueryData(['groups', false])).toEqual(['kept']);
  });

  // useQuery binds its observer to the client it first saw. A screen that stays mounted while the account changes (another
  // tab switched it) must therefore be remounted with the new client, or it keeps showing the old account's data and its
  // invalidations hit a cache nothing observes.
  it('remounts mounted screens on an account switch so they load the new account into the new client', async () => {
    const fetches: string[] = [];
    function Groups() {
      current = useQueryClient();
      const { data } = useQuery({
        queryKey: ['groups', false],
        queryFn: async () => { const who = String(localStorage.getItem('vs_user')); fetches.push(who); return `groups of ${who}`; },
      });
      return <div data-testid="groups">{data ?? 'loading'}</div>;
    }
    jest.useRealTimers(); // react-query's notifications need real timers to settle
    localStorage.setItem('vs_user', 'a@example.test');
    render(<SessionQueryProvider><Groups /></SessionQueryProvider>);
    await waitFor(() => expect(screen.getByTestId('groups').textContent).toBe('groups of a@example.test'));
    await setUser('b@example.test'); // another tab switched account; this tab's page stays mounted
    await waitFor(() => expect(screen.getByTestId('groups').textContent).toBe('groups of b@example.test'));
    // The screen's query lives in the NEW client (so invalidations after a save reach it), not the discarded one.
    expect(current.getQueryData(['groups', false])).toBe('groups of b@example.test');
    expect(fetches).toEqual(['a@example.test', 'b@example.test']);
  });

  it('does not clear or refetch the first client under StrictMode', async () => {
    const queryFn = jest.fn(async () => 'data');
    function Once() {
      const { data } = useQuery({ queryKey: ['config'], queryFn });
      return <div data-testid="once">{data ?? 'loading'}</div>;
    }
    jest.useRealTimers();
    localStorage.setItem('vs_user', 'a@example.test');
    render(<React.StrictMode><SessionQueryProvider><Once /></SessionQueryProvider></React.StrictMode>);
    await waitFor(() => expect(screen.getByTestId('once').textContent).toBe('data'));
    expect(queryFn).toHaveBeenCalledTimes(1);
  });
});
