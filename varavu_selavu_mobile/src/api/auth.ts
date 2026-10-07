import { boundedFetch, RequestError } from './request';
// src/api/auth.ts
//
// Every call below passes `credentials: 'omit'` — see apiFetch.ts's own comment for why:
// the backend sets a `vs_token` cookie on login/refresh regardless of client type, and
// React Native's fetch (unlike a browser) will otherwise keep and resend it, tripping the
// backend's CSRF double-submit check on every subsequent mutating request.
import API_BASE_URL from './apiconfig';

export interface LoginPayload {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  email?: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  /** Optional — not collected at sign-up in V2; the backend accepts it being absent. */
  phone?: string;
  password: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  console.log(`Logging in to ${API_BASE_URL}...`);
  const params = new URLSearchParams();
  params.append('username', payload.username);
  params.append('password', payload.password);

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        credentials: 'omit',
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Login failed:', response.status, errorText);
        throw new Error(`Login failed: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error("Network error during login:", error);
    throw error;
  }
}

export async function register(payload: RegisterPayload): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    credentials: 'omit',
  });

  if (!response.ok) {
    // Never show the raw response body — map 422 validation errors to per-field messages.
    const body = await response.json().catch(() => null);
    const fieldErrors: Record<string, string> = {};
    if (response.status === 422 && Array.isArray(body?.detail)) {
      for (const d of body.detail as { loc?: string[]; msg?: string }[]) {
        const field = d.loc?.[d.loc.length - 1];
        if (!field || fieldErrors[field]) continue;
        fieldErrors[field] =
          field === 'email' ? "That email address isn't valid. Check for typos, like name@example.com."
            : field === 'password' ? 'Use at least 8 characters.'
              : (d.msg || 'Check this field.');
      }
    }
    const message = response.status === 429
      ? 'Too many attempts — wait a bit and try again.'
      : 'Registration failed. Please check your details and try again.';
    throw Object.assign(new Error(message), { status: response.status, fieldErrors });
  }
}

export async function logout(refresh_token: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token }),
    credentials: 'omit',
  });
}

/**
 * Requests a password-reset email. Always resolves — the backend reports success whether or
 * not the address is registered (an "email not found" response would let a caller enumerate
 * accounts), so there is deliberately no way to distinguish the two from here either.
 */
export async function forgotPassword(payload: ForgotPasswordPayload): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/forgot-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    credentials: 'omit',
  });
  if (!response.ok) {
    throw new Error('Something went wrong. Please try again.');
  }
}

/**
 * Redeems a password-reset token (from the emailed link) and sets a new password. The backend
 * rejects an unknown, already-used, wrong-purpose, or expired (1 hour) token with the same
 * generic 400 either way, so this surfaces its `detail` message as-is rather than guessing
 * which case applies.
 */
export async function resetPassword(payload: ResetPasswordPayload): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    credentials: 'omit',
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error((errData as any).detail || 'Failed to reset password');
  }
}

export async function refresh(refresh_token: string): Promise<LoginResponse> {
  const response = await boundedFetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token }),
    credentials: 'omit',
  }, 15_000);
  if (!response.ok) {
    throw new RequestError('Could not refresh your session. Please try again.', false, response.status);
  }
  return response.json();
}


/** Re-sends the email-verification link to the signed-in user (needed before creating or
 * joining groups). Bearer-authenticated via apiFetch. */
export async function resendVerification(): Promise<void> {
  // Lazy: apiFetch imports this module (for token refresh), so a static import would be circular.
  const { apiFetch } = await import('./apiFetch');
  const res = await apiFetch('/api/v1/auth/resend-verification', { method: 'POST' });
  if (!res.ok) throw new Error(res.status === 429 ? 'Too many requests — try again later.' : 'Could not send the email.');
}
