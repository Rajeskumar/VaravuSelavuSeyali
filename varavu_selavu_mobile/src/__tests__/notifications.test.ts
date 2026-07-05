/**
 * notifications.test.ts — Tests for TS-GRP-110 mobile push registration.
 *
 * expo-notifications/expo-device are native modules with no real implementation
 * under Jest, so they're mocked directly (matching how heic2any is mocked on the
 * web side for a similar "no native/browser API in test env" reason).
 */
import { Platform } from 'react-native';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));

jest.mock('expo-device', () => ({ isDevice: true }));

jest.mock('../api/devices', () => ({
  registerDevice: jest.fn(),
  unregisterDevice: jest.fn(),
}));

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { registerDevice, unregisterDevice } from '../api/devices';
import {
  registerForPushNotifications,
  unregisterPushNotifications,
  extractGroupIdFromNotificationData,
} from '../notifications';

const mockGetPermissionsAsync = Notifications.getPermissionsAsync as jest.Mock;
const mockRequestPermissionsAsync = Notifications.requestPermissionsAsync as jest.Mock;
const mockGetExpoPushTokenAsync = Notifications.getExpoPushTokenAsync as jest.Mock;
const mockRegisterDevice = registerDevice as jest.Mock;
const mockUnregisterDevice = unregisterDevice as jest.Mock;
const mockDevice = Device as unknown as { isDevice: boolean };

beforeEach(() => {
  jest.clearAllMocks();
  mockDevice.isDevice = true;
});

describe('unregisterPushNotifications (before any registration)', () => {
  // Must run before any successful registerForPushNotifications() call in this
  // file, since the "last registered token" is private module state with no
  // reset hook — this is the only way to observe the true "never registered" case.
  test('no-op when no token was ever registered', async () => {
    await unregisterPushNotifications();
    expect(mockUnregisterDevice).not.toHaveBeenCalled();
  });
});

describe('registerForPushNotifications', () => {
  test('no-op on a simulator/emulator (Device.isDevice === false)', async () => {
    mockDevice.isDevice = false;
    await registerForPushNotifications();
    expect(mockRegisterDevice).not.toHaveBeenCalled();
  });

  test('no-op when permission is denied', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied' });
    await registerForPushNotifications();
    expect(mockRegisterDevice).not.toHaveBeenCalled();
  });

  test('registers the token when permission is already granted', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
    await registerForPushNotifications();
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockRegisterDevice).toHaveBeenCalledWith(
      'ExponentPushToken[abc]',
      Platform.OS === 'ios' ? 'ios' : 'android',
    );
  });

  test('requests permission when not already granted, then registers', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[xyz]' });
    await registerForPushNotifications();
    expect(mockRequestPermissionsAsync).toHaveBeenCalled();
    expect(mockRegisterDevice).toHaveBeenCalledWith('ExponentPushToken[xyz]', expect.any(String));
  });

  test('a thrown error during registration does not propagate', async () => {
    mockGetPermissionsAsync.mockRejectedValue(new Error('native module unavailable'));
    await expect(registerForPushNotifications()).resolves.toBeUndefined();
    expect(mockRegisterDevice).not.toHaveBeenCalled();
  });
});

describe('unregisterPushNotifications', () => {
  test('unregisters the most recently registered token', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[to-remove]' });
    await registerForPushNotifications();

    await unregisterPushNotifications();
    expect(mockUnregisterDevice).toHaveBeenCalledWith('ExponentPushToken[to-remove]');
  });

  test('a thrown error during unregistration does not propagate', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[fail]' });
    await registerForPushNotifications();
    mockUnregisterDevice.mockRejectedValue(new Error('network error'));

    await expect(unregisterPushNotifications()).resolves.toBeUndefined();
  });
});

describe('extractGroupIdFromNotificationData', () => {
  test('reads group_id directly when present', () => {
    expect(extractGroupIdFromNotificationData({ group_id: 'g-123' })).toBe('g-123');
  });

  test('falls back to parsing deep_link when group_id is absent', () => {
    expect(
      extractGroupIdFromNotificationData({ deep_link: 'trackspense://groups/g-456' }),
    ).toBe('g-456');
  });

  test('returns null for undefined data', () => {
    expect(extractGroupIdFromNotificationData(undefined)).toBeNull();
  });

  test('returns null when neither field yields a group id', () => {
    expect(extractGroupIdFromNotificationData({ some_other_field: 'x' })).toBeNull();
  });
});
