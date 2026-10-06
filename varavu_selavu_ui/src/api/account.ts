import { fetchWithAuth } from './api';
import { setCsrfToken } from './csrf';

/** Account-security calls (change password, sign-in sessions, deleting the account, downloading
 * all data). They share one rule: the server's message is what the person should read. */
async function failWith(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const body = await res.json();
    if (typeof body?.detail === 'string') message = body.detail;
    else if (Array.isArray(body?.detail) && body.detail[0]?.msg) message = body.detail[0].msg;
  } catch {
    /* keep the fallback */
  }
  throw new Error(message);
}

export interface SignInSession {
  family_id: string;
  signed_in_at: string | null;
  last_active_at: string | null;
  current: boolean;
}

export async function changePassword(payload: { current_password?: string; new_password: string }): Promise<void> {
  const res = await fetchWithAuth('/api/v1/auth/change-password', { method: 'POST', body: JSON.stringify(payload) });
  if (!res.ok) await failWith(res, 'Could not change your password');
  // The server re-issues this session; pick up its fresh CSRF token.
  const body = await res.json().catch(() => null);
  if (body?.csrf_token) setCsrfToken(body.csrf_token);
}

export async function listSessions(): Promise<SignInSession[]> {
  const res = await fetchWithAuth('/api/v1/auth/sessions');
  if (!res.ok) await failWith(res, 'Could not load your sign-ins');
  return (await res.json()).items;
}

export async function endSession(familyId: string): Promise<void> {
  const res = await fetchWithAuth(`/api/v1/auth/sessions/${familyId}`, { method: 'DELETE' });
  if (!res.ok) await failWith(res, 'Could not sign that device out');
}

export async function signOutEverywhere(): Promise<void> {
  const res = await fetchWithAuth('/api/v1/auth/logout-all', { method: 'POST' });
  if (!res.ok) await failWith(res, 'Could not sign you out everywhere');
}

export async function deleteAccount(proof: { password?: string; confirm_email?: string }): Promise<void> {
  const res = await fetchWithAuth('/api/v1/auth/profile', { method: 'DELETE', body: JSON.stringify(proof) });
  if (!res.ok) await failWith(res, 'Could not delete your account');
}

/** Downloads everything TrackSpense holds about the signed-in user as one JSON file. */
export async function downloadMyData(): Promise<void> {
  const res = await fetchWithAuth('/api/v1/account/export');
  if (!res.ok) await failWith(res, 'Could not export your data');
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'trackspense_my_data.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
