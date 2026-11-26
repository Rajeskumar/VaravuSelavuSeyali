import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { analytics } from './index';
import { loadConsent } from './consent';

/**
 * Mounted once under AuthProvider. Loads the stored consent at start-up and forgets the analytics
 * identity whenever the session ends or the account changes, including a forced (401) sign-out
 * that skips the sign-out cleanups. The email is compared locally and never sent anywhere.
 */
export default function AnalyticsLifecycle() {
  const { accessToken, userEmail, isLoading } = useAuth();
  const previous = useRef<string | null>(null);

  useEffect(() => { void loadConsent(); }, []);

  useEffect(() => {
    if (isLoading) return;
    const account = accessToken ? (userEmail ?? 'signed-in') : null;
    if (previous.current !== null && previous.current !== account) analytics.resetIdentity();
    previous.current = account;
  }, [accessToken, userEmail, isLoading]);

  return null;
}
