/**
 * Closed operational diagnostics schema for web client (TS-OBS-001 AC-08, AC-09).
 * Separate from behavioral GA4 analytics: never includes user IDs, amounts, descriptions,
 * messages, URLs or free-text error strings.
 */

export type DiagnosticPlatform = 'web';

export type ApiOperation =
  | 'expense_list'
  | 'analysis'
  | 'insight_list'
  | 'group_detail'
  | 'receipt_parse'
  | 'ai_query';

export type ApiOutcome =
  | 'success'
  | 'rejected'
  | 'failed'
  | 'timeout'
  | 'network_error'
  | 'cancelled';

export type SaveOperation =
  | 'personal_expense_create'
  | 'personal_expense_update'
  | 'group_expense_create'
  | 'group_expense_update'
  | 'settlement_create';

export type ClientErrorOperation = 'render' | 'chunk_load' | 'unhandled_rejection';

export type SafeErrorType =
  | 'Error'
  | 'TypeError'
  | 'RangeError'
  | 'ReferenceError'
  | 'SyntaxError'
  | 'RequestError'
  | 'other';

export type DiagnosticEvent =
  | {
      name: 'api_completed';
      operation: ApiOperation;
      platform: DiagnosticPlatform;
      outcome: ApiOutcome;
      duration_ms: number;
      request_id?: string;
      build?: string;
    }
  | {
      name: 'dashboard_ready';
      operation: 'dashboard';
      platform: DiagnosticPlatform;
      outcome: 'success' | 'failed';
      duration_ms: number;
      build?: string;
    }
  | {
      name: 'save_confirmed';
      operation: SaveOperation;
      platform: DiagnosticPlatform;
      outcome: 'confirmed';
      duration_ms: number;
      request_id?: string;
      build?: string;
    }
  | {
      name: 'save_failed';
      operation: SaveOperation;
      platform: DiagnosticPlatform;
      outcome: 'rejected';
      duration_ms: number;
      request_id?: string;
      build?: string;
    }
  | {
      name: 'save_unknown';
      operation: SaveOperation;
      platform: DiagnosticPlatform;
      outcome: 'unknown';
      duration_ms: number;
      request_id?: string;
      build?: string;
    }
  | {
      name: 'web_vital';
      operation: 'lcp' | 'inp';
      platform: 'web';
      outcome: 'measured';
      duration_ms: number;
      unit?: 'ms';
      build?: string;
    }
  | {
      name: 'web_vital';
      operation: 'cls';
      platform: 'web';
      outcome: 'measured';
      value: number;
      unit: 'score';
      build?: string;
    }
  | {
      name: 'client_error';
      operation: ClientErrorOperation;
      platform: DiagnosticPlatform;
      outcome: 'failed';
      error_type?: SafeErrorType;
      build?: string;
    };

export interface DiagnosticBatchEnvelope {
  schema_version: 1;
  events: DiagnosticEvent[];
}

const SAFE_ERROR_TYPES = new Set<SafeErrorType>([
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'RequestError',
  'other',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toSafeErrorType(err: unknown): SafeErrorType {
  if (err instanceof Error && SAFE_ERROR_TYPES.has(err.name as SafeErrorType)) {
    return err.name as SafeErrorType;
  }
  return 'other';
}

export function sanitizeRequestId(value: string | null | undefined): string | undefined {
  if (typeof value === 'string' && UUID_RE.test(value.trim())) {
    return value.trim().toLowerCase();
  }
  return undefined;
}

export function clampDurationMs(ms: number): number | null {
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(Math.min(ms, 300_000) * 100) / 100;
}

export function clampClsScore(score: number): number | null {
  if (!Number.isFinite(score) || score < 0) return null;
  return Math.round(Math.min(score, 10) * 10_000) / 10_000;
}
