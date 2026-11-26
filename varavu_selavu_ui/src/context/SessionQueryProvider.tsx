import React, { useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSessionIdentity } from '../hooks/useSessionIdentity';

function createSessionClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000, // 1 minute
        gcTime: 5 * 60_000, // 5 minutes
        refetchOnWindowFocus: false,
      },
    },
  });
}

/**
 * One query client per signed-in account (mobile parity: `core/auth/SessionQueryProvider`). Feature query keys such as
 * ['groups', false], ['cards-mine'] or ['budgets', ...] carry no user, so a client shared across logins would show the
 * previous account's data to the next one for the length of its staleTime. Clearing one shared client is not enough: a
 * save still in flight at logout runs its callbacks afterwards and would write the old account's data back. So the client
 * is replaced as soon as the stored identity goes away (logout, or the 401 forced logout, which removes the same key) or
 * becomes a different account (another tab), and late callbacks write to the discarded one.
 */
export default function SessionQueryProvider({ children }: { children: React.ReactNode }) {
  const user = useSessionIdentity();
  const [session, setSession] = useState(() => ({ client: createSessionClient(), user, generation: 0 }));

  // Adjusting state during render: the first render after the identity changes already gets the new client.
  if (session.user !== user) {
    const keep = !!user && !session.user; // signed-out to signed-in keeps the client that was created at logout
    setSession({
      client: keep ? session.client : createSessionClient(),
      user,
      generation: keep ? session.generation : session.generation + 1,
    });
  }

  // useQuery/useMutation bind to the client they first saw and never rebind, so a screen still mounted when the account
  // changes (another tab switched it) would keep reading and writing the discarded client. A new client therefore
  // remounts everything below it.
  const { client, generation } = session;

  // Clears a replaced client once the old subtree has unsubscribed from it. Done when a swap is seen, not in an unmount
  // cleanup, which StrictMode's simulated unmount would run against the live first client.
  const previous = useRef(client);
  useEffect(() => {
    if (previous.current !== client) {
      previous.current.clear();
      previous.current = client;
    }
  }, [client]);

  return (
    <QueryClientProvider client={client}>
      <React.Fragment key={generation}>{children}</React.Fragment>
    </QueryClientProvider>
  );
}
