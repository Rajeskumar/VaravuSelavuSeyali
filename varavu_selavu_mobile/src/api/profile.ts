// src/api/profile.ts
import { apiFetch } from './apiFetch';

export interface Profile {
  email: string;
  name?: string | null;
  phone?: string | null;
  address?: string | null;
}

export async function getProfile(): Promise<Profile> {
  const res = await apiFetch('/api/v1/auth/profile', { method: 'GET' });
  if (!res.ok) throw new Error('Failed to load profile');
  return res.json();
}

export async function updateProfile(payload: { name?: string | null; phone?: string | null; address?: string | null }): Promise<Profile> {
  const res = await apiFetch('/api/v1/auth/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update profile');
  return res.json();
}

export async function deleteProfile(): Promise<{ success: boolean }> {
  const res = await apiFetch('/api/v1/auth/profile', { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete profile');
  return res.json();
}
