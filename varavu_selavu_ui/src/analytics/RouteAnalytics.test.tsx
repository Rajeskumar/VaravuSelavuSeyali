import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import RouteAnalytics from './RouteAnalytics';
import RouteA11y from '../components/common/RouteA11y';

jest.mock('./browser', () => {
  const { createAnalyticsClient } = jest.requireActual('./client');
  const { createRecordingProvider } = jest.requireActual('./providers/recording');
  const recording = createRecordingProvider();
  const client = createAnalyticsClient({ enabled: true, measurementId: 'G-TESTONLY01', origin: globalThis.location.origin }, recording.provider);
  client.initialize(); client.setConsent('granted');
  return { analytics: client, recordedEvents: recording.events, finishInviteOutcome: jest.fn() };
});
const recordedEvents = (jest.requireMock('./browser') as { recordedEvents: Array<{ properties: Record<string, string> }> }).recordedEvents;
function Nav() {
  const navigate = useNavigate();
  return <>
    <button onClick={() => navigate('/expenses')}>Expenses</button>
    <button onClick={() => navigate('/expenses?merchant=SECRET')}>Filter</button>
    <button onClick={() => navigate('/groups/PRIVATE')}>Group</button>
    <button onClick={() => navigate(-1)}>Back</button>
    <button onClick={() => navigate(1)}>Forward</button>
  </>;
}
test('actual React effects preserve exactly-once navigation and titles under StrictMode, including redirects and back/forward', async () => {
  localStorage.setItem('vs_user', 'synthetic@example.test');
  window.history.replaceState({}, '', '/profile');
  render(<React.StrictMode><BrowserRouter><RouteA11y /><RouteAnalytics /><Nav /><Routes>
    <Route path="/profile" element={<Navigate to="/account" replace />} />
    <Route path="/account" element={<h1>Account</h1>} />
    <Route path="/expenses" element={<h1>Expenses</h1>} />
    <Route path="/groups/:id" element={<h1>Groups</h1>} />
  </Routes></BrowserRouter></React.StrictMode>);
  await waitFor(() => expect(recordedEvents).toHaveLength(1));
  expect(recordedEvents[0].properties.route_template).toBe('/account');
  fireEvent.click(screen.getByRole('button', { name: 'Expenses' }));
  expect(document.title).toBe('Expenses — TrackSpense');
  expect(recordedEvents).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
  expect(recordedEvents).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Group' }));
  expect(recordedEvents).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  await waitFor(() => expect(recordedEvents).toHaveLength(4));
  fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
  await waitFor(() => expect(recordedEvents).toHaveLength(5));
  expect(JSON.stringify(recordedEvents)).not.toMatch(/PRIVATE|SECRET|synthetic/);
});
