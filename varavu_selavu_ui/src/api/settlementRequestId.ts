import { RequestError } from './request';

/**
 * One id per payment, so the server stores it once (TS-FIX-104). If the outcome is unknown (timeout, lost connection,
 * 5xx), the id is kept: sending the same payment again then returns the stored one instead of recording a second. From
 * then on a failed retry (offline, signed out, rate limited) keeps it too, because it says nothing about the first send.
 * It is dropped after success, a refusal of a never-unconfirmed payment or a 409, after an hour, and when the app closes. Mirrors the mobile client.
 */
const KEEP_MS = 60 * 60 * 1000;
const pendingIds = new Map<string, { id: string; since: number; unconfirmed?: boolean }>();

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 6)}`;

const outcomeUnknown = (error: unknown) =>
  (error instanceof RequestError && error.outcomeUnknown) || Number((error as { status?: number } | null)?.status) >= 500;

export async function withSettlementRequestId<T>(
  groupId: string,
  payment: { from_member_id: string; to_member_id: string; amount: number },
  send: (requestId: string) => Promise<T>,
): Promise<T> {
  const key = [groupId, payment.from_member_id, payment.to_member_id, Math.round(payment.amount * 100)].join('|');
  const held = pendingIds.get(key);
  const entry = held && Date.now() - held.since <= KEEP_MS ? held : { id: newId(), since: Date.now() };
  pendingIds.set(key, entry); // before sending: two sends at once share the id
  try {
    const result = await send(entry.id);
    pendingIds.delete(key);
    return result;
  } catch (error) {
    if (outcomeUnknown(error)) {
      entry.unconfirmed = true;
      pendingIds.set(key, entry); // a refused twin sent at the same moment may have removed it
    } else if (!entry.unconfirmed || (error as { status?: number } | null)?.status === 409) pendingIds.delete(key);
    throw error;
  }
}
