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
    const errorText = await response.text();
    throw new Error(`Registration failed: ${errorText}`);
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
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token }),
    credentials: 'omit',
  });
  if (!response.ok) {
    throw new Error('Refresh failed');
  }
  return response.json();
}
