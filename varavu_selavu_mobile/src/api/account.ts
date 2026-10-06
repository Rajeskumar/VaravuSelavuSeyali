import { apiFetch } from './apiFetch';

/** Account-security calls (change password, sign-ins, delete, download my data). The server's
 * message is what the person should read. */
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

export async function getSecurityInfo(): Promise<{ has_password: boolean; email_verified: boolean }> {
  const res = await apiFetch('/api/v1/auth/me', { method: 'GET' });
  if (!res.ok) await failWith(res, 'Could not load your account');
  const body = await res.json();
  return { has_password: body.has_password !== false, email_verified: !!body.email_verified };
}

/** Returns the re-issued session so the app can keep this device signed in after the change. */
export async function changePassword(payload: { current_password?: string; new_password: string }): Promise<{ access_token?: string | null; refresh_token?: string | null }> {
  const res = await apiFetch('/api/v1/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await failWith(res, 'Could not change your password');
  return res.json();
}

export async function listSessions(): Promise<SignInSession[]> {
  const res = await apiFetch('/api/v1/auth/sessions', { method: 'GET' });
  if (!res.ok) await failWith(res, 'Could not load your sign-ins');
  return (await res.json()).items;
}

export async function endSession(familyId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/auth/sessions/${familyId}`, { method: 'DELETE' });
  if (!res.ok) await failWith(res, 'Could not sign that device out');
}

export async function signOutEverywhere(): Promise<void> {
  const res = await apiFetch('/api/v1/auth/logout-all', { method: 'POST' });
  if (!res.ok) await failWith(res, 'Could not sign you out everywhere');
}

export async function deleteAccount(proof: { password?: string; confirm_email?: string }): Promise<void> {
  const res = await apiFetch('/api/v1/auth/profile', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proof),
  });
  if (!res.ok) await failWith(res, 'Could not delete your account');
}

export async function fetchMyDataJson(): Promise<string> {
  const res = await apiFetch('/api/v1/account/export', { method: 'GET' });
  if (!res.ok) await failWith(res, 'Could not export your data');
  return res.text();
}
