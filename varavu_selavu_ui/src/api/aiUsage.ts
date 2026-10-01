import { fetchWithAuth } from './api';

/** AI cost gating (backend services/ai_quota_service.py). Every LLM-backed endpoint draws from
 * a per-user daily allowance; these types and helpers let the UI show what's left and turn the
 * structured 429/403/503 errors into friendly copy instead of "[object Object]". */

export type AiFeature = 'chat' | 'receipt' | 'categorize';

export interface AiFeatureUsage {
  used: number;
  limit: number | null; // null = unlimited
  remaining: number | null;
}

export interface AiUsage {
  features: Record<AiFeature, AiFeatureUsage>;
  resets_at: string;
  ai_enabled: boolean;
  paused: boolean;
  blocked: boolean;
  email_verified: boolean;
  requires_verified_email: boolean;
}

export type AiErrorCode = 'ai_quota_exceeded' | 'ai_paused' | 'ai_disabled' | 'ai_blocked' | 'email_not_verified';

export interface AiErrorDetail {
  code: AiErrorCode;
  message: string;
  feature?: AiFeature;
  limit?: number;
  used?: number;
  resets_at?: string;
}

export async function getAiUsage(): Promise<AiUsage> {
  const res = await fetchWithAuth('/api/v1/ai/usage');
  if (!res.ok) throw new Error('Failed to fetch AI usage');
  return res.json();
}

/** Error thrown by AI-backed API calls when the backend refused for a gating reason. */
export class AiLimitError extends Error {
  readonly detail: AiErrorDetail;
  constructor(detail: AiErrorDetail) {
    super(aiErrorMessage(detail));
    this.name = 'AiLimitError';
    this.detail = detail;
  }
}

export function formatResetTime(iso?: string): string {
  if (!iso) return 'tomorrow';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'tomorrow';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function aiErrorMessage(detail: AiErrorDetail): string {
  switch (detail.code) {
    case 'ai_quota_exceeded': {
      const at = formatResetTime(detail.resets_at);
      const n = detail.limit != null ? `${detail.limit} ` : '';
      if (detail.feature === 'receipt') {
        return `You've used today's ${n}receipt scans. Enter this one manually — more scans at ${at}.`;
      }
      return `You've used all ${n}AI questions for today. More at ${at}.`;
    }
    case 'ai_paused':
      return 'AI is taking a break right now. Please try again later.';
    case 'ai_disabled':
      return 'AI features are turned off right now.';
    case 'ai_blocked':
      return "AI features aren't available on this account.";
    case 'email_not_verified':
      return 'Verify your email to use AI features — check your inbox for the link.';
    default:
      return detail.message || 'AI is unavailable right now.';
  }
}

/** Build the right Error from a failed AI response: AiLimitError for gating refusals, a plain
 * Error (with the backend's string detail when it has one) otherwise. */
export async function aiErrorFromResponse(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => ({} as any));
  const detail = (body as any)?.detail;
  if (detail && typeof detail === 'object' && typeof detail.code === 'string') {
    return new AiLimitError(detail as AiErrorDetail);
  }
  return new Error(typeof detail === 'string' && detail ? detail : fallback);
}
