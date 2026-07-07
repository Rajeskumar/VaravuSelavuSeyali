/**
 * notifications.ts — Expo push registration + notification tap handling (TS-GRP-110).
 *
 * Registration is best-effort: a denied permission or a non-physical-device
 * (simulator) is a silent no-op, never a crash — push notifications are a nice-to-have
 * on top of the core group features, not a requirement to use the app.
 */
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { registerDevice, unregisterDevice } from './api/devices';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let _lastRegisteredToken: string | null = null;

export async function registerForPushNotifications(): Promise<void> {
  try {
    if (!Device.isDevice) {
      return; // Simulators/emulators have no push capability.
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return; // Permission denied — no-op, not an error.
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    const expoPushToken = tokenResponse.data;
    const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';

    await registerDevice(expoPushToken, platform);
    _lastRegisteredToken = expoPushToken;
  } catch (e) {
    // Fire-and-forget: registration failing must never block login/app start.
    console.warn('Push notification registration failed', e);
  }
}

export async function unregisterPushNotifications(): Promise<void> {
  if (!_lastRegisteredToken) return;
  try {
    await unregisterDevice(_lastRegisteredToken);
  } catch (e) {
    console.warn('Push notification unregistration failed', e);
  } finally {
    _lastRegisteredToken = null;
  }
}

/**
 * Extracts the group_id from a notification's data payload (deep_link:
 * "trackspense://groups/{id}", set server-side by NotificationService.fan_out)
 * so the notification-tap handler can navigate directly, without relying on
 * OS-level URL routing (see App.tsx's addNotificationResponseReceivedListener).
 */
export function extractGroupIdFromNotificationData(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  if (typeof data.group_id === 'string' && data.group_id) return data.group_id;
  const deepLink = data.deep_link;
  if (typeof deepLink === 'string') {
    const match = deepLink.match(/groups\/([^?#/]+)/);
    if (match) return match[1];
  }
  return null;
}
