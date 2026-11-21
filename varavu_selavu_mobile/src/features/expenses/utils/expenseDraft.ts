import * as SecureStore from 'expo-secure-store';
const KEY = 'expense_draft_v1';
export const DRAFT_TTL_MS = 60 * 60 * 1000;
// Serialize storage operations: a slow write cannot resurrect a discarded/saved draft.
let revision = 0;
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation, operation);
  queue = result.catch(() => {});
  return result;
}
export function clearExpenseDraft(owner?: string, expected?: unknown) {
  if (!owner) revision += 1;
  return enqueue(async () => {
    if (owner) {
      const raw = await SecureStore.getItemAsync(KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.owner !== owner || (expected !== undefined && JSON.stringify(saved.value) !== JSON.stringify(expected))) return;
    }
    await SecureStore.deleteItemAsync(KEY);
  });
}
export function writeExpenseDraft(owner: string, value: unknown): Promise<void> {
  const raw = JSON.stringify({ owner, expiresAt: Date.now() + DRAFT_TTL_MS, value });
  const current = ++revision;
  // Skip superseded edits queued behind a slow secure-store write.
  return enqueue(() => current === revision ? SecureStore.setItemAsync(KEY, raw) : Promise.resolve());
}
export function readExpenseDraft<T>(owner: string): Promise<T | null> {
  return enqueue(async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (!raw) return null;
      const draft = JSON.parse(raw);
      if (draft.owner !== owner || !Number.isFinite(draft.expiresAt) || draft.expiresAt <= Date.now() || !draft.value || typeof draft.value !== 'object') {
        await SecureStore.deleteItemAsync(KEY);
        return null;
      }
      return draft.value as T;
    } catch { await SecureStore.deleteItemAsync(KEY); return null; }
  });
}
