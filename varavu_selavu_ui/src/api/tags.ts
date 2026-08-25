import { fetchWithAuth } from './api';

export class ApiError extends Error {
  status: number;
  detail: any;
  constructor(message: string, status: number, detail: any) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function throwApiError(res: Response, fallbackMessage: string): Promise<never> {
  let detail: any = null;
  try {
    const body = await res.json();
    detail = body?.detail ?? body;
  } catch {
    /* ignore — non-JSON error body */
  }
  const message = typeof detail === 'string' ? detail : detail?.message || fallbackMessage;
  throw new ApiError(message, res.status, detail);
}

export interface TagDTO {
  id: string;
  name: string;
  color: string;
  status: 'Active' | 'Archived';
  created_at: string;
  // Derived, not stored (PRD §8.1) — computed from expense_tags, used to rank autocomplete
  // most-recently-used then most-used.
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
  const res = await fetchWithAuth(`/api/v1/tags${suffix}`, { method: 'GET' });
  if (!res.ok) throw new Error('Failed to load tags');
  return res.json();
}

export async function createTag(name: string, color?: string): Promise<TagDTO> {
  const res = await fetchWithAuth('/api/v1/tags', {
    method: 'POST',
    body: JSON.stringify({ name, color }),
  });
  if (!res.ok) await throwApiError(res, 'Failed to create tag');
  return res.json();
}

export async function updateTag(tagId: string, data: { name?: string; color?: string; status?: 'Active' | 'Archived' }): Promise<TagDTO> {
  const res = await fetchWithAuth(`/api/v1/tags/${tagId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update tag');
  return res.json();
}

export async function deleteTag(tagId: string): Promise<void> {
  const res = await fetchWithAuth(`/api/v1/tags/${tagId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete tag');
}

export async function applyTagsToExpense(expenseId: string, data: { tag_ids?: string[]; tag_names?: string[] }): Promise<TagRefDTO[]> {
  const res = await fetchWithAuth(`/api/v1/expenses/${expenseId}/tags`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to apply tags');
  return res.json();
}

export async function removeTagFromExpense(expenseId: string, tagId: string): Promise<void> {
  const res = await fetchWithAuth(`/api/v1/expenses/${expenseId}/tags/${tagId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to remove tag');
}

export interface TagBulkFilter {
  start_date?: string; // YYYY-MM-DD
  end_date?: string;
  group_id?: string | null;
  category?: string | null;
  merchant_name?: string | null;
}

export interface TagBulkRequest {
  tag_id?: string;
  tag_name?: string;
  expense_ids?: string[];
  filter?: TagBulkFilter;
  dry_run: boolean;
}

export interface TagBulkResponse {
  matched_count: number;
  already_tagged_count: number;
  applied_count: number;
  my_expenses_total: number;
  i_paid_total: number;
}

export async function bulkApplyTags(data: TagBulkRequest): Promise<TagBulkResponse> {
  const res = await fetchWithAuth('/api/v1/tags/bulk_apply', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to bulk apply tags');
  return res.json();
}

export async function bulkRemoveTags(data: TagBulkRequest): Promise<TagBulkResponse> {
  const res = await fetchWithAuth('/api/v1/tags/bulk_remove', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to bulk remove tags');
  return res.json();
}
