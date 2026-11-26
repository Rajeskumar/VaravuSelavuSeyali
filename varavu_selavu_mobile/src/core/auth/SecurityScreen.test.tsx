import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import SecurityScreen from './SecurityScreen';
import { changePassword } from './accountApi';
import { advanceSession } from './session';

jest.mock('../theme/ThemeContext', () => {
  const { buildTheme } = jest.requireActual('../theme/theme');
  return { useAppTheme: () => ({ theme: buildTheme('dark'), isDark: true }) };
});
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));
jest.mock('./AuthContext', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));
jest.mock('../ui/Toast', () => ({ showToast: jest.fn() }));
jest.mock('./accountApi', () => ({
  changePassword: jest.fn(),
  getSecurityInfo: jest.fn(async () => ({ has_password: true, email_verified: true })),
  listSessions: jest.fn(async () => []),
  endSession: jest.fn(),
  signOutEverywhere: jest.fn(),
}));
const mockData = new Map<string, string>();
let mockGate: Promise<void> | null = null;
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockData.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { if (mockGate) await mockGate; mockData.set(k, v); }),
  deleteItemAsync: jest.fn(async (k: string) => { mockData.delete(k); }),
}));
const change = changePassword as jest.Mock;

let finish!: (v: { access_token: string; refresh_token: string }) => void;
beforeEach(() => {
  mockData.clear(); mockGate = null;
  mockData.set('access_token', 'a-old'); mockData.set('refresh_token', 'r-old'); mockData.set('user_email', 'a@example.test');
  change.mockReset();
  change.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
});

// "Change password" is both the section label and the button text; the button is the last match.
async function press() {
  render(<SecurityScreen />);
  fireEvent.changeText(screen.getByLabelText('Current password'), 'old-password');
  fireEvent.changeText(screen.getByLabelText('New password'), 'new-password-1');
  fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'new-password-1');
  const buttons = screen.getAllByText('Change password');
  await act(async () => { fireEvent.press(buttons[buttons.length - 1]); });
}

describe('SecurityScreen change password', () => {
  it('keeps this device signed in with the re-issued tokens while the session is unchanged', async () => {
    await press();
    await act(async () => { finish({ access_token: 'a-new', refresh_token: 'r-new' }); });
    await waitFor(() => expect(mockData.get('refresh_token')).toBe('r-new'));
    expect(mockData.get('access_token')).toBe('a-new');
  });

  it('does not restore tokens when the user signed out before the change finished', async () => {
    await press();
    // Sign-out: session ends, tokens deleted.
    advanceSession(); mockData.delete('access_token'); mockData.delete('refresh_token'); mockData.delete('user_email');
    await act(async () => { finish({ access_token: 'a-new', refresh_token: 'r-new' }); });
    expect(mockData.has('access_token')).toBe(false);
    expect(mockData.has('refresh_token')).toBe(false);
  });

  it("does not overwrite another account's tokens, including the same user signing back in", async () => {
    await press();
    advanceSession(); // sign-out
    advanceSession(); // the same user (or another) signs in
    mockData.set('access_token', 'a-second'); mockData.set('refresh_token', 'r-second');
    await act(async () => { finish({ access_token: 'a-new', refresh_token: 'r-new' }); });
    expect([mockData.get('access_token'), mockData.get('refresh_token')]).toEqual(['a-second', 'r-second']);
  });

  it('leaves no tokens when sign-out lands between the check and the two writes', async () => {
    await press();
    let release!: () => void;
    mockGate = new Promise<void>((r) => { release = r; });
    await act(async () => { finish({ access_token: 'a-new', refresh_token: 'r-new' }); });
    // First write is held open: the check has passed. Now sign out the way AuthProvider does.
    const { runTokenWrite } = jest.requireActual('./session');
    advanceSession();
    const deletes = runTokenWrite(async () => {
      await SecureStore.deleteItemAsync('access_token'); await SecureStore.deleteItemAsync('refresh_token');
    });
    release();
    await act(async () => { await deletes; });
    expect(mockData.has('access_token')).toBe(false);
    expect(mockData.has('refresh_token')).toBe(false);
  });
});
