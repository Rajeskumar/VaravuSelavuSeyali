const mockAnalyticsSdk = {
  setAnalyticsCollectionEnabled: jest.fn(),
  logEvent: jest.fn(),
  logScreenView: jest.fn(),
  resetAnalyticsData: jest.fn(),
};
const mockCrashSdk = {
  setCrashlyticsCollectionEnabled: jest.fn(),
  recordError: jest.fn(),
  log: jest.fn(),
  setAttribute: jest.fn(),
  crash: jest.fn(),
  deleteUnsentReports: jest.fn(),
};

jest.mock('@react-native-firebase/analytics', () => ({ getAnalytics: () => mockAnalyticsSdk }));
jest.mock('@react-native-firebase/crashlytics', () => ({ getCrashlytics: () => mockCrashSdk }));

import { createFirebaseProvider } from './firebase';
import { createFirebaseCrashProvider } from './crashFirebase';

test('the supported Firebase SDK APIs receive consent and events', () => {
  const analytics = createFirebaseProvider();
  analytics.setCollectionEnabled(true);
  analytics.logScreen('home');
  analytics.logEvent('login', { platform: 'ios' });
  expect(mockAnalyticsSdk.setAnalyticsCollectionEnabled).toHaveBeenCalledWith(true);
  expect(mockAnalyticsSdk.logScreenView).toHaveBeenCalledWith({ screen_name: 'home', screen_class: 'home' });
  expect(mockAnalyticsSdk.logEvent).toHaveBeenCalledWith('login', { platform: 'ios' });

  const crash = createFirebaseCrashProvider();
  crash.setCollectionEnabled(true);
  expect(mockCrashSdk.setCrashlyticsCollectionEnabled).toHaveBeenCalledWith(true);
});
