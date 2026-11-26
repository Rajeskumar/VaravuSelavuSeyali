/**
 * notifications.ts — Expo push registration + notification tap handling (TS-GRP-110).
 *
 * Registration is best-effort: a denied permission or a non-physical-device
 * (simulator) is a silent no-op, never a crash — push notifications are a nice-to-have
 * on top of the core features, not a requirement to use the app.
 */
import { reportPermission } from '../analytics/permissions';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { registerDevice, unregisterDevice } from './devicesApi';
import { logger } from '../logger';
import { getAppConfig } from '../config/appConfig';

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

    // Android 8+ shows nothing without a channel, and on Android 13+ the permission prompt only
    // appears once one exists — so create it before asking.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: getAppConfig().notifications.androidChannelName,
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    // Expo push tokens are issued per EAS project. Without `extra.eas.projectId` in app.json
    // (created by `eas init`) getExpoPushTokenAsync throws and no device ever registers.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      logger.warn('Push notifications are off: no EAS projectId (run `eas init`).');
      return;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      reportPermission('notifications', { granted: status === 'granted' });
    }
    if (finalStatus !== 'granted') {
      return; // Permission denied — no-op, not an error.
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenResponse.data;
    const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';

    await registerDevice(expoPushToken, platform);
    _lastRegisteredToken = expoPushToken;
  } catch (e: any) {
    // Fire-and-forget: registration failing must never block login/app start.
    if (e?.message?.includes('aps-environment')) {
      // the withDisablePush config plugin strips the entitlement unless the build opts in.
      logger.info('Push notifications are disabled in this build (no aps-environment entitlement).');
    } else {
      logger.warn('Push notification registration failed', e);
    }
  }
}

export async function unregisterPushNotifications(): Promise<void> {
  if (!_lastRegisteredToken) return;
  try {
    await unregisterDevice(_lastRegisteredToken);
  } catch (e) {
    logger.warn('Push notification unregistration failed', e);
  } finally {
    _lastRegisteredToken = null;
  }
}
