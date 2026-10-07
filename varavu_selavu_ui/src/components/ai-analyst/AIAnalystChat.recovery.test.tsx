import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import AIAnalystChat from './AIAnalystChat';
import { useChatConversation } from '../../hooks/useChatConversation';
import { getModels } from '../../api/models';
import { ensureAiConsent } from '../../utils/aiConsent';
import { fetchWithAuth } from '../../api/api';

jest.mock('../../api/api', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('../../api/models', () => ({ getModels: jest.fn(async () => ({ models: [] })) }));
jest.mock('../../utils/aiConsent', () => ({ ensureAiConsent: jest.fn(async () => true) }));
jest.mock('../../hooks/useAiUsage', () => ({ useAiUsage: () => ({ exhausted: false, unavailable: false, refresh: jest.fn() }) }));
jest.mock('../common/AiQuotaNote', () => ({ __esModule: true, default: () => null }));

beforeEach(() => {
  Element.prototype.scrollIntoView = jest.fn();
  (getModels as jest.Mock).mockResolvedValue({ models: [] });
  (ensureAiConsent as jest.Mock).mockResolvedValue(true);
});
afterEach(() => jest.clearAllMocks());
function Host() {
  const conversation = useChatConversation();
  const [mobile, setMobile] = React.useState(false);
  return <><button onClick={() => setMobile((value) => !value)}>Change layout</button>
    <AIAnalystChat key={mobile ? 'phone' : 'desktop'} userId="user" conversation={conversation} />
  </>;
}

test('responsive remounts retain pending work and its result without another AI request', async () => {
  let complete!: (value: unknown) => void;
  (fetchWithAuth as jest.Mock).mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
  render(<Host />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Ask about your spending' }), { target: { value: 'How much did I spend?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await screen.findByText('Thinking…');
  fireEvent.click(screen.getByRole('button', { name: 'Change layout' }));
  expect(screen.getByText('How much did I spend?')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  await act(async () => complete({ ok: true, json: async () => ({ response: 'Your total is $32.98.' }) }));
  expect(await screen.findByText('Your total is $32.98.')).toBeInTheDocument();
  expect(fetchWithAuth).toHaveBeenCalledTimes(1);
});
