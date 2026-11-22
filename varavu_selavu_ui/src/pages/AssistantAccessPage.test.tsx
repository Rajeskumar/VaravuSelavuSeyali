import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AssistantAccessPage from './AssistantAccessPage';
import { fetchWithAuth } from '../api/api';
jest.mock('../api/api', () => ({ fetchWithAuth: jest.fn() }));
const mocked = fetchWithAuth as jest.Mock;
const response = (body: unknown, ok = true) => Promise.resolve({ ok, json: async () => body });
function mount(mode: 'manage' | 'approve' | 'connect') {
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/ai/test/op_123']}><Routes><Route path="/ai/test/:id" element={<AssistantAccessPage mode={mode} />} /></Routes></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => mocked.mockReset());
it('shows the empty connection and activity states', async () => {
  mocked.mockImplementation(() => response([])); mount('manage');
  expect(await screen.findByText('No connected assistants.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Connected assistants');
});
it('requires warning acknowledgment and never saves from approval', async () => {
  const draft = { status: 'pending_approval', approval_revision: 2, expires_at: '2026-12-01T00:00:00Z', preview: { description: 'Lunch', amount: '12.34', currency: 'USD', date: '2020-01-02', category_id: 'food.dining' }, warnings: [{ code: 'possible_duplicate' }] };
  mocked.mockImplementation((_path: string, options?: RequestInit) => response(options?.method === 'POST' ? { ...draft, status: 'approved' } : draft));
  mount('approve');
  const approve = await screen.findByRole('button', { name: 'Approve expense' });
  expect(approve).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /I reviewed the warnings/ }));
  fireEvent.click(approve);
  expect(await screen.findByText(/Approved, not saved yet/)).toBeInTheDocument();
  expect(mocked.mock.calls.filter(([,opts]) => opts?.method === 'POST')).toEqual([['/api/v1/mcp/approvals/op_123', { method: 'POST', body: JSON.stringify({ approve: true, approval_revision: 2, acknowledge_warnings: true }) }]]);
});
it('surfaces expired requests without an approve button', async () => {
  mocked.mockImplementation(() => response({ status: 'expired', approval_revision: 1 }));mount('approve');
  expect(await screen.findByText(/request is expired/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Approve expense' })).not.toBeInTheDocument();
});
it('shows recoverable authentication errors', async () => {
  mocked.mockImplementation(() => response({ detail: 'Sign in again to approve this request' }, false));mount('connect');
  expect(await screen.findByRole('alert')).toHaveTextContent('Sign in again');
  expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href', '/ai/reauth');
});
it('disconnects only the selected connection', async () => {
  mocked.mockImplementation((path: string) => response(path.endsWith('activity') ? [] : [{ id: 'conn1', client_name: 'Claude', scopes: ['categories:read'], status: 'active', expires_at: '2027-01-01' }]));mount('manage');
  fireEvent.click(await screen.findByRole('button', { name: 'Disconnect Claude' }));
  await waitFor(() => expect(mocked).toHaveBeenCalledWith('/api/v1/mcp/connections/conn1', { method: 'DELETE' }));
});
