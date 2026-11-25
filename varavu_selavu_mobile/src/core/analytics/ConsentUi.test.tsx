import React from 'react';
import { render, fireEvent, waitFor, act, within } from '@testing-library/react-native';
import { Linking, ScrollView } from 'react-native';

const store: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => store[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { store[k] = v; }),
  deleteItemAsync: jest.fn(async (k: string) => { delete store[k]; }),
}));
jest.mock('../theme/ThemeContext', () => {
  const { buildTheme } = jest.requireActual('../theme/theme');
  return { useAppTheme: () => ({ theme: buildTheme('dark'), mode: 'dark', isDark: true }) };
});
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn() }) }));
let mockAuth = { accessToken: 'a' as string | null, userEmail: 'ada@example.test' as string | null, isLoading: false };
jest.mock('../auth/AuthContext', () => ({ useAuth: () => mockAuth }));

import ConsentPrompt from './ConsentPrompt';
import { resetOverlayGateForTests, setOverlayBusy } from '../ui/overlayGate';
import PrivacyScreen from './PrivacyScreen';
import AnalyticsLifecycle from './AnalyticsLifecycle';
import { configureAnalytics, setAnalyticsEnvironment } from './index';
import { createRecordingProvider } from './providers/recording';
import { getConsentState, loadConsent, resetConsentForTests } from './consent';

let provider: ReturnType<typeof createRecordingProvider>;
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  resetConsentForTests();
  resetOverlayGateForTests();
  mockAuth = { accessToken: 'a', userEmail: 'ada@example.test', isLoading: false };
  setAnalyticsEnvironment('qa');
  provider = createRecordingProvider();
  configureAnalytics({ provider, events: { ping: { feature: 'x', properties: {} } }, platform: 'ios', product: 'demo' });
});

describe('first-run prompt', () => {
  test('is shown once until answered, with both switches off and equal buttons', async () => {
    await loadConsent();
    const { getByText, getAllByRole, queryByText } = render(<ConsentPrompt />);
    expect(getByText('Help improve the app?')).toBeTruthy();
    const switches = getAllByRole('switch');
    expect(switches).toHaveLength(2);
    for (const s of switches) expect(s.props.accessibilityState.checked).toBe(false);
    expect(getByText('Save my choices')).toBeTruthy();
    expect(getByText('No thanks')).toBeTruthy();
    expect(provider.calls).toEqual([{ type: 'collection', enabled: false }]); // start-up reconcile, nothing collected
    fireEvent.press(getByText('No thanks'));
    await waitFor(() => expect(queryByText('Help improve the app?')).toBeNull());
    expect(getConsentState()).toMatchObject({ analytics: 'denied', crash: 'denied' });
    expect(provider.calls.filter((c) => c.type === 'event')).toEqual([]);
  });
  test('saves each switch independently', async () => {
    await loadConsent();
    const { getByText, getAllByRole } = render(<ConsentPrompt />);
    fireEvent.press(getAllByRole('switch')[1]); // crash only
    fireEvent.press(getByText('Save my choices'));
    await waitFor(() => expect(getConsentState()).toMatchObject({ analytics: 'denied', crash: 'granted' }));
    expect(provider.calls).not.toContainEqual({ type: 'collection', enabled: true });
  });
  test('the text scrolls but both buttons stay outside it, so large type cannot push them off screen', async () => {
    await loadConsent();
    const { UNSAFE_getByType, getByText } = render(<ConsentPrompt />);
    const scroll = within(UNSAFE_getByType(ScrollView));
    expect(scroll.queryByText('Help improve the app?')).toBeTruthy();
    expect(scroll.queryByText('Save my choices')).toBeNull();
    expect(scroll.queryByText('No thanks')).toBeNull();
    expect(getByText('Save my choices')).toBeTruthy();
  });
  test('discloses identifiers and non-deletability, links the policy, and ties each disclosure to its switch', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    await loadConsent();
    const { getByText, getAllByRole } = render(<ConsentPrompt />);
    expect(getByText(/device identifier and approximate location/)).toBeTruthy();
    expect(getByText(/can't be deleted for one account/)).toBeTruthy();
    const [analytics, crash] = getAllByRole('switch');
    expect(analytics.props.accessibilityHint).toMatch(/screens and features/);
    expect(crash.props.accessibilityHint).toMatch(/crash and error reports/);
    fireEvent.press(getByText('Read the Privacy Policy'));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/\/privacy-policy$/));
    open.mockRestore();
  });
  test('waits while another full-screen prompt is open, then appears', async () => {
    await loadConsent();
    const { queryByText } = render(<ConsentPrompt />);
    expect(queryByText('Help improve the app?')).toBeTruthy();
    act(() => setOverlayBusy('recurring', true));
    expect(queryByText('Help improve the app?')).toBeNull();
    act(() => setOverlayBusy('recurring', false));
    expect(queryByText('Help improve the app?')).toBeTruthy();
  });
  test('tells the person when the choice could not be saved (it still applies for the session)', async () => {
    const SecureStore = jest.requireMock('expo-secure-store');
    SecureStore.setItemAsync.mockRejectedValue(new Error('keychain'));
    const toast = jest.spyOn(jest.requireActual('../ui/Toast'), 'showToast').mockImplementation(() => undefined);
    await loadConsent();
    const { getByText } = render(<ConsentPrompt />);
    fireEvent.press(getByText('No thanks'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/Couldn't save your choice/) })));
    expect(getConsentState()).toMatchObject({ analytics: 'denied', crash: 'denied' });
    SecureStore.setItemAsync.mockImplementation(async (k: string, v: string) => { store[k] = v; });
    toast.mockRestore();
  });
  test('is not shown again once either choice is stored', async () => {
    store.analytics_consent_v1 = 'denied';
    await loadConsent();
    const { queryByText } = render(<ConsentPrompt />);
    expect(queryByText('Help improve the app?')).toBeNull();
  });
  test('a build that cannot collect (development, test, native E2E) never asks', async () => {
    setAnalyticsEnvironment('off');
    await loadConsent();
    const { queryByText } = render(<ConsentPrompt />);
    expect(queryByText('Help improve the app?')).toBeNull();
  });
  test('is not shown before the stored choice has loaded', () => {
    const { queryByText } = render(<ConsentPrompt />);
    expect(queryByText('Help improve the app?')).toBeNull();
  });
});

describe('Privacy screen', () => {
  test('switches wait for the stored choice, so they never flash a wrong state', () => {
    const { getAllByRole } = render(<PrivacyScreen />);
    for (const s of getAllByRole('switch')) expect(s.props.accessibilityState.disabled).toBe(true);
  });
  test('toggling applies immediately and survives a reload', async () => {
    await loadConsent();
    const { getAllByRole } = render(<PrivacyScreen />);
    fireEvent.press(getAllByRole('switch')[0]);
    await waitFor(() => expect(getConsentState().analytics).toBe('granted'));
    expect(provider.calls).toContainEqual({ type: 'collection', enabled: true });
    expect(store.analytics_consent_v1).toBe('granted');
    fireEvent.press(getAllByRole('switch')[0]);
    await waitFor(() => expect(getConsentState().analytics).toBe('denied'));
    expect(provider.calls.slice(-2)).toEqual([{ type: 'collection', enabled: false }, { type: 'reset' }]);
  });
});

describe('identity lifecycle', () => {
  const resets = () => provider.calls.filter((c) => c.type === 'reset').length;
  test('sign-out, forced sign-out and an account switch reset identity; token refresh and first sign-in do not', async () => {
    const { rerender } = render(<AnalyticsLifecycle />);
    await act(async () => {});
    expect(resets()).toBe(0);
    mockAuth = { ...mockAuth, accessToken: 'refreshed' }; rerender(<AnalyticsLifecycle />);
    expect(resets()).toBe(0);
    mockAuth = { ...mockAuth, userEmail: 'grace@example.test' }; rerender(<AnalyticsLifecycle />);
    expect(resets()).toBe(1);
    mockAuth = { accessToken: null, userEmail: null, isLoading: false }; rerender(<AnalyticsLifecycle />);
    expect(resets()).toBe(2);
    mockAuth = { accessToken: 'b', userEmail: 'ada@example.test', isLoading: false }; rerender(<AnalyticsLifecycle />);
    expect(resets()).toBe(2); // signing in is not a reset
  });
  test('no email or token ever reaches the provider', async () => {
    store.analytics_consent_v1 = 'granted';
    const { rerender } = render(<AnalyticsLifecycle />);
    await act(async () => {});
    mockAuth = { accessToken: null, userEmail: null, isLoading: false }; rerender(<AnalyticsLifecycle />);
    expect(JSON.stringify(provider.calls)).not.toMatch(/ada@|example|token/);
  });
});
