import { getAppConfig } from '../config/appConfig';

// In Expo, localhost refers to the device itself. To reach a backend on the host machine use
// 10.0.2.2 (Android emulator), localhost (iOS simulator) or the machine's LAN IP (physical device),
// via the EXPO_PUBLIC_API_URL development override.
export function getApiBaseUrl(): string {
  const configured = getAppConfig().api.baseUrl;
  return __DEV__ ? (process.env.EXPO_PUBLIC_API_URL || configured) : configured;
}
