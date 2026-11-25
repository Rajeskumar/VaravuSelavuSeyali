import { AiConsentDeclined, ensureAiConsent } from '../utils/aiConsent';
import { apiFetch } from '../../../core/api/apiFetch';
import { aiErrorFromResponse, AiLimitError } from './aiUsage';
import { analytics } from '../../../core/analytics';
import { durationBucket, safeFailure, track } from '../../shared/analytics/operations';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** What the agent actually looked at for a turn (backend TS-ANL-013) — real, not inferred client-side. */
export interface ChatResolvedPeriod {
  start_date: string;
  end_date: string;
  label: string;
  source: 'parsed_from_query' | 'explicit_param' | 'default';
}

export interface ChatResolvedScope {
  kind: 'personal' | 'group';
  group_id?: string | null;
  group_name?: string | null;
}

export interface ChatResult {
  response: string;
  resolved_period?: ChatResolvedPeriod;
  resolved_scope?: ChatResolvedScope;
}

export interface ChatPayload {
  user_id: string;
  messages: ChatMessage[];
  model?: string;
  provider?: string;
  year?: number;
  month?: number;
  start_date?: string;
  end_date?: string;
}

/**
 * Send a chat query to the backend AI analyst.
 * Endpoint: POST /api/v1/analysis/chat
 * Payload: { user_id, messages, model?, provider?, year?, month?, start_date?, end_date? }
 * Response: { response: string }
 */
export async function sendChatMessage(token: string, payload: ChatPayload): Promise<string> {
  return (await sendChatMessageFull(token, payload)).response;
}

/** Same call as `sendChatMessage`, keeping the resolved period/scope the backend returns. */
export async function sendChatMessageFull(_token: string, payload: ChatPayload): Promise<ChatResult> {
  // Questions are answered by a third-party AI service; ask the person first.
  if (!(await ensureAiConsent())) throw new AiConsentDeclined();
  // Counted only once the question really goes out: no prompt text, model, scope or answer is ever reported.
  const operation = analytics.beginOperation();
  const startedAt = Date.now();
  let failedStatus: number | undefined;
  track('ai_query_started', {}, operation);
  try {
    const response = await apiFetch(`/api/v1/analysis/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      failedStatus = response.status;
      throw await aiErrorFromResponse(response, 'Failed to send message');
    }

    const data = await response.json();
    track('ai_query_completed', { duration_bucket: durationBucket(Date.now() - startedAt) }, operation);
    return {
      response: data.response || 'No response',
      resolved_period: data.resolved_period,
      resolved_scope: data.resolved_scope,
    };
  } catch (error) {
    const failure = error instanceof AiLimitError ? { outcome: 'failure' as const, error_code: 'quota' as const }
      : failedStatus !== undefined ? safeFailure({ status: failedStatus }) : safeFailure(error);
    track('ai_query_failed', { ...failure, duration_bucket: durationBucket(Date.now() - startedAt) }, operation);
    throw error;
  }
}
