import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// App must mount the per-account query client; a module-level QueryClient would be shared by every login.
jest.mock('heic2any', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('./context/SessionQueryProvider', () => {
  const { QueryClient, QueryClientProvider } = jest.requireActual('@tanstack/react-query');
  const client = new QueryClient();
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}><div data-testid="session-query-provider">{children}</div></QueryClientProvider>
    ),
  };
});

test('App mounts the per-account query client around the whole tree', () => {
  render(<App />);
  expect(screen.getByTestId('session-query-provider')).toBeTruthy();
  expect(screen.getAllByText(/TrackSpense/i).length).toBeGreaterThan(0); // the app rendered inside it
});
