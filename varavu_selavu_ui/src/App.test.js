import { render, screen } from '@testing-library/react';
import App from './App';
jest.mock('heic2any', () => ({
  default: jest.fn(),
}), { virtual: true });

test('renders app title', () => {
  render(<App />);
  // HomePage (unauthenticated landing) renders "TrackSpense" in both the header
  // logo and the "Try TrackSpense free" CTA, so multiple matches are expected.
  const titles = screen.getAllByText(/TrackSpense/i);
  expect(titles.length).toBeGreaterThan(0);
});
