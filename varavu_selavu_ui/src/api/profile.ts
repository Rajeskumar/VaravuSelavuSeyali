import { fetchWithAuth } from './api';

export interface Profile {
  email: string;
  name?: string | null;
  phone?: string | null;
}

export async function getProfile(): Promise<Profile> {
  const res = await fetchWithAuth('/api/v1/auth/profile', { method: 'GET' });
  if (!res.ok) throw new Error('Failed to load profile');
  return res.json();
}

export async function updateProfile(payload: { name?: string | null; phone?: string | null }): Promise<Profile> {
  const res = await fetchWithAuth('/api/v1/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update profile');
  return res.json();
}

