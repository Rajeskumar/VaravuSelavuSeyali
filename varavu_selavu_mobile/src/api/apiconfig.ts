// src/api/apiconfig.ts
import Constants from 'expo-constants';

// In Expo, localhost refers to the device itself.
// To connect to the host machine (where backend is running):
// - Android Emulator: 10.0.2.2
// - iOS Simulator: localhost
// - Physical Device: Your computer's LAN IP (e.g., 192.168.1.X)

// Default to Android Emulator IP for development if not configured
const DEV_API_URL = 'https://varavu-selavu-backend-952416556244.us-central1.run.app';

const API_BASE_URL = __DEV__
  ? (process.env.EXPO_PUBLIC_API_URL || DEV_API_URL)
  : 'https://varavu-selavu-backend-952416556244.us-central1.run.app';

export default API_BASE_URL;
