/** Sensitive drafts stay in this tab, expire after an hour, and never cross accounts. */
export const EXPENSE_DRAFT_KEY = 'vs_expense_draft_v1';
export const DRAFT_TTL_MS = 60 * 60 * 1000;
export function clearExpenseDraft(owner?: string, expected?: unknown) {
  try {
    if (owner) {
      const raw = sessionStorage.getItem(EXPENSE_DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.owner !== owner || (expected !== undefined && JSON.stringify(saved.value) !== JSON.stringify(expected))) return;
    }
    sessionStorage.removeItem(EXPENSE_DRAFT_KEY);
  } catch { /* storage may be blocked */ }
}
export function readExpenseDraft<T>(owner: string): T | null {
  try {
    const raw = sessionStorage.getItem(EXPENSE_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (draft.owner !== owner || !Number.isFinite(draft.expiresAt) || draft.expiresAt <= Date.now() || !draft.value || typeof draft.value !== 'object') {
      clearExpenseDraft();
      return null;
    }
    return draft.value as T;
  } catch { clearExpenseDraft(); return null; }
}
export function writeExpenseDraft(owner: string, value: unknown): boolean {
  try {
    sessionStorage.setItem(EXPENSE_DRAFT_KEY, JSON.stringify({ owner, expiresAt: Date.now() + DRAFT_TTL_MS, value }));
    return true;
  } catch { return false; }
}
