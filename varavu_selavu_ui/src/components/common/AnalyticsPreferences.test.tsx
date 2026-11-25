import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AnalyticsPreferences, { AnalyticsPreferencesButton } from './AnalyticsPreferences';
import ConsentBanner from './ConsentBanner';

beforeEach(() => localStorage.clear());
test('choice can be reopened and withdrawn; banner follows the preference change', async () => {
  render(<><AnalyticsPreferencesButton /><AnalyticsPreferences /><ConsentBanner /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Analytics preferences' }));
  expect(screen.getByRole('dialog', { name: 'Analytics preferences' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Allow analytics' }));
  expect(localStorage.getItem('vs_analytics_consent')).toBe('granted');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.queryByRole('region', { name: 'Cookie consent' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Analytics preferences' }));
  fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
  expect(localStorage.getItem('vs_analytics_consent')).toBe('denied');

});
test('closing preferences does not grant consent', async () => {
  render(<><AnalyticsPreferencesButton /><AnalyticsPreferences /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Analytics preferences' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(localStorage.getItem('vs_analytics_consent')).toBeNull();
});

test('a failed storage write is announced and never claims the choice was saved', () => {
  render(<><AnalyticsPreferencesButton /><AnalyticsPreferences /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Analytics preferences' }));
  const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked'); });
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Allow analytics' }));
    expect(screen.getByRole('alert')).toHaveTextContent('could not save');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(localStorage.getItem('vs_analytics_consent')).toBeNull();
  } finally { spy.mockRestore(); }
});
