import { fetchWithAuth } from './api';

export interface RecurringTemplateDTO {
  id: string;
  description: string;
  category: string;
  day_of_month: number; // 1-31
  default_cost: number;
  start_date_iso: string; // YYYY-MM-DD
  last_processed_iso?: string;
  status: 'active' | 'paused';
}

export interface UpsertRecurringTemplatePayload {
  description: string;
  category: string;
  day_of_month: number;
  default_cost: number;
  start_date_iso?: string;
  status?: 'active' | 'paused';
}

export async function upsertRecurringTemplate(payload: UpsertRecurringTemplatePayload): Promise<RecurringTemplateDTO> {
  const res = await fetchWithAuth('/api/v1/recurring/upsert', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save recurring template');
  return res.json();
}

export async function listRecurringTemplates(): Promise<RecurringTemplateDTO[]> {
  const res = await fetchWithAuth('/api/v1/recurring/templates', { method: 'GET' });
  if (!res.ok) throw new Error('Failed to load recurring templates');
  return res.json();
}

export interface DueOccurrenceDTO {
  template_id: string;
  date_iso: string; // YYYY-MM-DD
  description: string;
  category: string;
  suggested_cost: number;
}

export async function getRecurringDue(asOfISO?: string): Promise<DueOccurrenceDTO[]> {
  const qs = asOfISO ? `?as_of=${encodeURIComponent(asOfISO)}` : '';
  const res = await fetchWithAuth(`/api/v1/recurring/due${qs}`, { method: 'GET' });
  if (!res.ok) throw new Error('Failed to load due recurring expenses');
  return res.json();
}

export async function confirmRecurring(items: { template_id: string; date_iso: string; cost: number }[]): Promise<{ success: boolean }> {
  const res = await fetchWithAuth('/api/v1/recurring/confirm', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error('Failed to confirm recurring expenses');
  return res.json();
}

export async function deleteRecurringTemplate(template_id: string): Promise<{ success: boolean }> {
  const res = await fetchWithAuth(`/api/v1/recurring/templates/${template_id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete recurring template');
  return res.json();
}

export async function executeRecurringNow(template_id: string, cost?: number): Promise<{ success: boolean; created?: boolean }> {
  const res = await fetchWithAuth('/api/v1/recurring/execute_now', {
    method: 'POST',
    body: JSON.stringify({ template_id, cost }),
  });
  if (!res.ok) throw new Error('Failed to execute template');
  return res.json();
}
