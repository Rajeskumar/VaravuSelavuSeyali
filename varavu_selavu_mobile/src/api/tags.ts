/**
 * tags.ts — Mobile API client for Custom Tags (TS-TAG-112).
 *
 * Reduced mobile v1 scope (PRD §11.2): apply/remove EXISTING tags + the tag filter only.
 * Tag creation, rename/recolor/archive, and bulk apply stay web-only in v1 — so unlike the
 * web client, this file never calls POST/PUT/DELETE /tags, only GET (to list what already
 * exists) and the per-expense association endpoints.
 */
import { apiFetch } from './apiFetch';

export interface TagDTO {
  id: string;
  name: string;
  color: string;
  status: 'Active' | 'Archived';
  created_at: string;
  usage_count: number;
  last_used_at: string | null;
}

export interface TagRefDTO {
  id: string;
  name: string;
  color: string;
}

export async function listTags(params?: { q?: string; status?: 'active' | 'archived' | 'all'; limit?: number }): Promise<TagDTO[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set('q', params.q);
  if (params?.status) qs.set('status', params.status);
  if (params?.limit) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await apiFetch(`/api/v1/tags${suffix}`, { method: 'GET' });
  if (!res.ok) throw new Error('Failed to load tags');
  return res.json();
}

export async function applyTagsToExpense(expenseId: string, data: { tag_ids?: string[]; tag_names?: string[] }): Promise<TagRefDTO[]> {
  const res = await apiFetch(`/api/v1/expenses/${expenseId}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to apply tags');
  return res.json();
}

export async function removeTagFromExpense(expenseId: string, tagId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/expenses/${expenseId}/tags/${tagId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to remove tag');
}
