import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from './AuthContext';

function createSessionClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 5 * 60 * 1000, // 5 minutes
      },
    },
  });
}

/**
 * One query client per signed-in session. Feature query keys need not include the user, so the next account on the
 * device must never see this cache. Clearing a shared client is not enough: a save still in flight at sign-out runs
 * its callbacks afterwards and would write the old account's data back. So the client is replaced as soon as there is
 * no access token, and late callbacks write to the discarded one.
 *
 * Covers explicit and forced (401) sign-out. This is not a sign-out cleanup: it only drops copies of server data,
 * never drafts or other work in progress. Must sit inside AuthProvider.
 */
export default function SessionQueryProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  const signedIn = !!accessToken;
  const [session, setSession] = useState(() => ({ client: createSessionClient(), signedIn }));

  // Adjusting state during render: the first signed-out render already gets the new client.
  if (session.signedIn !== signedIn) {
    setSession({ client: signedIn ? session.client : createSessionClient(), signedIn });
  }

  // Runs once a client has been replaced and the signed-in screens have unsubscribed from it.
  const { client } = session;
  useEffect(() => () => client.clear(), [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
