// src/api/auth.ts
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
  phone: string;
  password: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const params = new URLSearchParams();
  params.append('username', payload.username);
  params.append('password', payload.password);
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error('Login failed');
  }

  return response.json();
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

  return response.json();
}

export async function register(payload: RegisterPayload): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Registration failed');
  }
}

export async function logout(refresh_token: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token }),
  });
}

export async function refresh(refresh_token: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token }),
  });
  if (!response.ok) {
    throw new Error('Refresh failed');
  }
  return response.json();
}

export interface ForgotPasswordPayload {
  email: string;
  password: string;
}

export async function forgotPassword(payload: ForgotPasswordPayload): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/forgot-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Forgot password failed');
  }
}
