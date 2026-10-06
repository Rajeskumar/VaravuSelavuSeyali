import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import RouteA11y, { titleForPath } from './RouteA11y';

test('every route gets its own title and unknown paths read as not found', () => {
  expect(titleForPath('/dashboard')).toBe('Dashboard — TrackSpense');
  expect(titleForPath('/groups/abc')).toBe('Groups — TrackSpense');
  expect(titleForPath('/groups/join/tok')).toBe('Join group — TrackSpense');
  expect(titleForPath('/profile')).toBe('Account — TrackSpense');
  expect(titleForPath('/nope')).toBe('Page not found — TrackSpense');
});

const Nav: React.FC = () => {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/expenses')}>go</button>;
};

test('a route change sets the title and moves focus to the new page heading', async () => {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <RouteA11y />
      <Nav />
      <main id="main-content">
        <Routes>
          <Route path="/dashboard" element={<h1>Dashboard</h1>} />
          <Route path="/expenses" element={<h1>Expenses</h1>} />
        </Routes>
      </main>
    </MemoryRouter>,
  );
  expect(document.title).toBe('Dashboard — TrackSpense');
  screen.getByText('go').click();
  await waitFor(() => expect(document.title).toBe('Expenses — TrackSpense'));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Expenses' })).toHaveFocus());
});
