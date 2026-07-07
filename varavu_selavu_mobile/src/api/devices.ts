/**
 * devices.ts — Mobile API client for Expo push-token registration (TS-GRP-110).
 *
 * Follows the same pattern as groups.ts:
 * - Uses `apiFetch` (from apiFetch.ts) so the JWT is attached automatically.
 * - Throws `ApiError` on non-2xx responses so callers can check `err.status`.
 */
import { apiFetch } from './apiFetch';

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;
  let detail: string;
  try {
    const body = await res.json();
    detail = (body as any)?.detail ?? res.statusText;
  } catch {
    detail = res.statusText;
  }
  throw new ApiError(detail, res.status, null);
}

export interface RegisterDeviceResponse {
  success: boolean;
}

export async function registerDevice(
  expoPushToken: string,
  platform: 'ios' | 'android',
): Promise<RegisterDeviceResponse> {
  const res = await apiFetch('/api/v1/devices/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expo_push_token: expoPushToken, platform }),
  });
  return handleResponse<RegisterDeviceResponse>(res);
}

export async function unregisterDevice(expoPushToken: string): Promise<RegisterDeviceResponse> {
  const res = await apiFetch(`/api/v1/devices/register?expo_push_token=${encodeURIComponent(expoPushToken)}`, {
    method: 'DELETE',
  });
  return handleResponse<RegisterDeviceResponse>(res);
}
