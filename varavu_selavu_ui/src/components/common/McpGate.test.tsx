import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import McpGate from './McpGate';
import { getConfig } from '../../api/config';

jest.mock('../../api/config', () => ({ getConfig: jest.fn() }));
const mocked = getConfig as jest.Mock;
const mount = () => render(<MemoryRouter><McpGate><p>assistant page</p></McpGate></MemoryRouter>);

it('renders the page when MCP is enabled', async () => {
  mocked.mockResolvedValue({ mcp_enabled: true });
  mount();
  expect(await screen.findByText('assistant page')).toBeInTheDocument();
});
it('shows the 404 when MCP is disabled', async () => {
  mocked.mockResolvedValue({ mcp_enabled: false });
  mount();
  expect(await screen.findByText('Page not found')).toBeInTheDocument();
  expect(screen.queryByText('assistant page')).not.toBeInTheDocument();
});
it('shows the 404 when the flags cannot be loaded', async () => {
  mocked.mockRejectedValue(new Error('x'));
  mount();
  expect(await screen.findByText('Page not found')).toBeInTheDocument();
});
