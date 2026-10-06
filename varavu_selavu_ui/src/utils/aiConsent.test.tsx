import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import AiConsentHost from '../components/common/AiConsentHost';
import { ensureAiConsent, hasAiConsent, recordAiConsent } from './aiConsent';

beforeEach(() => localStorage.setItem('vs_user', 'a@x.com'));
afterEach(() => localStorage.clear());

test('already-granted consent resolves immediately without asking', async () => {
  recordAiConsent(true);
  render(<AiConsentHost />);
  await expect(ensureAiConsent()).resolves.toBe(true);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('the first AI use names the provider and what is sent, and "Not now" sends nothing', async () => {
  render(<AiConsentHost />);
  const pending = ensureAiConsent();
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent(/Google's Gemini/);
  expect(dialog).toHaveTextContent(/receipt photos/i);
  fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
  await expect(pending).resolves.toBe(false);
  expect(hasAiConsent()).toBe(false);
});

test('allowing is remembered for that account only', async () => {
  render(<AiConsentHost />);
  const pending = ensureAiConsent();
  fireEvent.click(await screen.findByRole('button', { name: 'Allow AI features' }));
  await expect(pending).resolves.toBe(true);
  expect(hasAiConsent()).toBe(true);
  localStorage.setItem('vs_user', 'someone-else@x.com');
  expect(hasAiConsent()).toBe(false);
});

test('two things asking at once share one dialog and one answer', async () => {
  render(<AiConsentHost />);
  const a = ensureAiConsent();
  const b = ensureAiConsent();
  fireEvent.click(await screen.findByRole('button', { name: 'Allow AI features' }));
  await expect(Promise.all([a, b])).resolves.toEqual([true, true]);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
