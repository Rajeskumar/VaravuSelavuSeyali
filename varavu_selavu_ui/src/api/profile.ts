import { fetchWithAuth } from './api';

export interface Profile {
  email: string;
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  // TS-GRP-130: payment deep-link handles.
  venmo_handle?: string | null;
  paypal_handle?: string | null;
  upi_id?: string | null;
}

export async function getProfile(): Promise<Profile> {
  const res = await fetchWithAuth('/api/v1/auth/profile', { method: 'GET' });
  if (!res.ok) throw new Error('Failed to load profile');
  return res.json();
}

export async function updateProfile(payload: {
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  venmo_handle?: string | null;
  paypal_handle?: string | null;
  upi_id?: string | null;
}): Promise<Profile> {
  const res = await fetchWithAuth('/api/v1/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update profile');
  return res.json();
}

export async function deleteProfile(): Promise<{ success: boolean }> {
  const res = await fetchWithAuth('/api/v1/auth/profile', { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete profile');
  return res.json();
}

