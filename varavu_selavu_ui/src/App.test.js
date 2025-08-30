import { render, screen } from '@testing-library/react';
import App from './App';
jest.mock('heic2any', () => ({
  default: jest.fn(),
}), { virtual: true });

test('renders app title', () => {
  render(<App />);
  const title = screen.getByText(/Varavu Selavu/i);
  expect(title).toBeInTheDocument();
});
