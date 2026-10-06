import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

import GoogleSignInButton from './GoogleSignInButton';

// eslint-disable-next-line testing-library/no-node-access
const scriptTags = () => Array.from(document.head.querySelectorAll('script[src*="accounts.google.com"]'));

afterEach(() => {
  scriptTags().forEach((s) => s.remove());
  delete process.env.REACT_APP_GOOGLE_CLIENT_ID;
});

function load(clientId?: string) {
  if (clientId) process.env.REACT_APP_GOOGLE_CLIENT_ID = clientId;
  return GoogleSignInButton;
}

test('nothing is requested from Google until the button is clicked', () => {
  const Button = load('client-id.apps.googleusercontent.com');
  render(<Button onCredential={() => {}} />);
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  expect(scriptTags()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
  expect(scriptTags()).toHaveLength(1);
});

test('with no client id configured it renders nothing at all', () => {
  const Button = load();
  const { container } = render(<Button onCredential={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});

test('if Google cannot be reached the button disappears and the email form is what is left', () => {
  const Button = load('client-id.apps.googleusercontent.com');
  const { container } = render(<Button onCredential={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
  const script = scriptTags()[0] as HTMLScriptElement;
  act(() => {
    script.onerror?.(new Event('error'));
  });
  expect(container).toBeEmptyDOMElement();
});
