import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AskOverlay from './AskOverlay';

jest.mock('../ai-analyst/AIAnalystChat', () => ({
  __esModule: true,
  default: function Chat() {
    const [answer, setAnswer] = require('react').useState('');
    return <><button onClick={() => setAnswer('Retained answer')}>Ask question</button><p>{answer}</p></>;
  },
}));

afterEach(() => localStorage.clear());

test('mounts lazily, then preserves the conversation across close and reopen', async () => {
  localStorage.setItem('vs_user', 'user');
  const { rerender } = render(<AskOverlay open={false} onClose={() => {}} />);
  expect(screen.queryByText('Ask question')).not.toBeInTheDocument();
  rerender(<AskOverlay open onClose={() => {}} />);
  fireEvent.click(await screen.findByText('Ask question'));
  rerender(<AskOverlay open={false} onClose={() => {}} />);
  expect(await screen.findByText('Retained answer')).toBeInTheDocument();
  rerender(<AskOverlay open onClose={() => {}} />);
  expect(await screen.findByText('Retained answer')).toBeInTheDocument();
});
