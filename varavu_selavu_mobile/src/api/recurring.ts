import { apiFetch } from './apiFetch';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecurringTemplateDTO {
    id: string;
    description: string;
    category: string;
    day_of_month: number; // 1-31
    default_cost: number;
    start_date_iso: string; // YYYY-MM-DD
    last_processed_iso?: string;
}

export interface UpsertRecurringPayload {
    description: string;
    category: string;
    day_of_month: number;
    default_cost: number;
    start_date_iso?: string;
}

// ─── API Functions ────────────────────────────────────────────────────────────

export async function listRecurringTemplates(): Promise<RecurringTemplateDTO[]> {
    const res = await apiFetch('/api/v1/recurring/templates', { method: 'GET' });
    if (!res.ok) throw new Error('Failed to load recurring templates');
    return res.json();
}

export async function upsertRecurringTemplate(payload: UpsertRecurringPayload): Promise<RecurringTemplateDTO> {
    const res = await apiFetch('/api/v1/recurring/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to save recurring template');
    return res.json();
}

export async function deleteRecurringTemplate(templateId: string): Promise<{ success: boolean }> {
    const res = await apiFetch(`/api/v1/recurring/templates/${templateId}`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete recurring template');
    return res.json();
}

export async function executeRecurringNow(
    templateId: string,
    cost?: number,
): Promise<{ success: boolean; created?: boolean }> {
    const res = await apiFetch('/api/v1/recurring/execute_now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId, cost }),
    });
    if (!res.ok) throw new Error('Failed to execute template');
    return res.json();
}
