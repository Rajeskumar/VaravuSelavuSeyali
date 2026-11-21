import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProfileScreen from './ProfileScreen';
import { getProfile } from '../api/profile';

jest.mock('../../../core/theme/ThemeContext', () => {
  const { buildTheme } = jest.requireActual('../../../core/theme/theme');
  return {
    useAppTheme: () => ({
      theme: buildTheme('dark'), isDark: true, isSystemDefault: true, setMode: jest.fn(), useSystemTheme: jest.fn(),
    }),
  };
});
jest.mock('../../../core/auth/AuthContext', () => ({
  useAuth: () => ({ signOut: jest.fn(), userEmail: 'ada@example.com', accessToken: 'token' }),
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));
jest.mock('../../budgets/hooks/useBudgetsEnabled', () => ({ useBudgetsEnabled: () => ({ enabled: false }) }));
jest.mock('../../cards/hooks/useCardCoachEnabled', () => ({ useCardCoachEnabled: () => ({ enabled: false }) }));
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn(async () => ({ granted: true })) }));
jest.mock('../api/profile', () => ({ getProfile: jest.fn(), updateProfile: jest.fn() }));
const mockedGetProfile = getProfile as jest.MockedFunction<typeof getProfile>;

it('renders the account menu once the profile has loaded (hook order stays stable)', async () => {
  mockedGetProfile.mockResolvedValue({ email: 'ada@example.com', name: 'Ada Lovelace' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  render(
    <QueryClientProvider client={client}>
      <ProfileScreen navigation={{ navigate: jest.fn() }} />
    </QueryClientProvider>,
  );

  // Regression: a useState declared after the loading early-return made the second render run one
  // more hook than the first, so React threw and the menu never appeared.
  expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
  expect(screen.getByText('Download all my data')).toBeTruthy();
  client.clear();
});
