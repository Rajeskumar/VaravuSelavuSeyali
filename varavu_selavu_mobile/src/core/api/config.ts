/**
 * config.ts — generic fetch of the backend's client-visible config (feature flags). The shape is
 * the app's business: callers supply the type (see features/shared/featureFlags.ts).
 */
import { apiFetch } from './apiFetch';

/** Never requires auth and never 404s, unlike probing a feature endpoint directly. */
export async function fetchConfig<T>(): Promise<T> {
  const res = await apiFetch('/api/v1/config');
  if (!res.ok) throw new Error('Failed to fetch config');
  return res.json();
}
