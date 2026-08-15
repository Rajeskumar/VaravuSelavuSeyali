// src/api/auth.ts
import API_BASE_URL from './apiconfig';
import { csrfHeader, setCsrfToken } from './csrf';

export interface LoginPayload {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  email?: string;
  /** Echoed back in the X-CSRF-Token header on state-changing requests. */
  csrf_token?: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  phone?: string;
  password: string;
}

/** Carries the HTTP status so callers can distinguish rate-limiting, invalid
 * credentials, and other server errors instead of showing one generic message.
 * A network failure (no response at all) throws a plain Error instead, with no
 * `status` — callers should treat "not an ApiError" as "couldn't reach the server." */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface RefreshRequest {
  refresh_token: string;
}

/** Tokens arrive as HttpOnly cookies, so every auth call must send and accept
 * cookies. Nothing here reads or writes a token in localStorage. */
const withCookies: RequestInit = { credentials: 'include' };

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const params = new URLSearchParams();
  params.append('username', payload.username);
  params.append('password', payload.password);
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    ...withCookies,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new ApiError('Login failed', response.status);
  }

  const data: LoginResponse = await response.json();
  setCsrfToken(data.csrf_token);
  return data;
}

// Attempt to help backend map fields correctly by also sending decoded email/name
function decodeGoogleIdToken(idToken: string): { email?: string; name?: string } {
  try {
    const parts = idToken.split('.');
    if (parts.length < 2) return {};
    // Base64URL decode payload
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    const email = typeof payload.email === 'string' ? payload.email : undefined;
    const name =
      typeof payload.name === 'string'
        ? payload.name
        : typeof payload.given_name === 'string' || typeof payload.family_name === 'string'
        ? `${payload.given_name || ''} ${payload.family_name || ''}`.trim() || undefined
        : undefined;
    return { email, name };
  } catch {
    return {};
  }
}

export async function loginWithGoogle(id_token: string): Promise<LoginResponse> {
  const decoded = decodeGoogleIdToken(id_token);
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/google`, {
    ...withCookies,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    // Include email/name to avoid backend mis-mapping (e.g., into phone column)
    body: JSON.stringify({ id_token, email: decoded.email, name: decoded.name }),
  });

  if (!response.ok) {
    throw new Error('Google login failed');
  }

  const data: LoginResponse = await response.json();
  setCsrfToken(data.csrf_token);
  return data;
}

export async function register(payload: RegisterPayload): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
    ...withCookies,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new ApiError('Registration failed', response.status);
  }
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
    ...withCookies,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...csrfHeader(),
    },
  });
}

/** The refresh token travels as an HttpOnly cookie; there is nothing to pass. */
export async function refresh(): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
    ...withCookies,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error('Refresh failed');
  }
  const data: LoginResponse = await response.json();
  setCsrfToken(data.csrf_token);
  return data;
}

/** One-time upgrade for sessions predating cookie auth: hands the server the
 * refresh token still sitting in localStorage in exchange for cookies. */
export async function exchangeLegacySession(refresh_token: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/session`, {
    ...withCookies,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token }),
  });
  if (!response.ok) {
    throw new Error('Session exchange failed');
  }
  const data: LoginResponse = await response.json();
  setCsrfToken(data.csrf_token);
  return data;
}

export async function fetchMe(): Promise<{ email: string; csrf_token?: string; email_verified?: boolean }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, withCookies);
  if (!response.ok) {
    throw new Error('Not authenticated');
  }
  const data: { email: string; csrf_token?: string; email_verified?: boolean } = await response.json();
  setCsrfToken(data.csrf_token);
  return data;
}

export interface ForgotPasswordPayload {
  email: string;
}

export async function forgotPassword(payload: ForgotPasswordPayload): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/forgot-password`, {
    ...withCookies,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new ApiError('Forgot password failed', response.status);
  }
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
}

export async function resetPassword(payload: ResetPasswordPayload): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/reset-password`, {
    ...withCookies,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new ApiError('Reset password failed', response.status);
  }
}

export async function verifyEmail(token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/verify-email`, {
    ...withCookies,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) {
    throw new ApiError('Email verification failed', response.status);
  }
}

export async function resendVerification(): Promise<{ already_verified: boolean }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/resend-verification`, {
    ...withCookies,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeader() },
  });
  if (!response.ok) {
    throw new ApiError('Failed to resend verification email', response.status);
  }
  return response.json();
}
