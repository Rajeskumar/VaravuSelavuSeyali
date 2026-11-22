import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ConsentBanner, { BOTTOM_CHROME_VAR } from './ConsentBanner';

beforeEach(() => localStorage.clear());

it('shows until a choice is made and exposes the variable MainLayout uses to lift it', () => {
  render(<ConsentBanner />);
  expect(screen.getByRole('region', { name: 'Cookie consent' })).toBeInTheDocument();
  expect(BOTTOM_CHROME_VAR).toBe('--ts-bottom-chrome');
});

it('goes away once a choice is made', () => {
  render(<ConsentBanner />);
  fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
  expect(screen.queryByRole('region', { name: 'Cookie consent' })).not.toBeInTheDocument();
});
