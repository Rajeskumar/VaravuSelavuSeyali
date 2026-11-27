/**
 * Web Performance Diagnostics client (TS-OBS-001 AC-08, AC-09).
 *
 * Guarantees:
 * - No pre-consent capture or retrospective replay.
 * - Scoped to signed-in journeys only; session changes/logout/withdrawal immediately
 *   clear queued events and invalidate late in-flight measurements from prior sessions.
 * - Max 60 events/session, max 10 events/batch, max 1 flush/minute, no durable queue.
 * - Calls only the approved API host (`/api/v1/telemetry/batch`), never triggers auth
 *   refresh or retries, never instruments itself, and drops failures silently.
 */

import {
  isDiagnosticsConsented,
  subscribeDiagnosticsConsent,
} from './consent';
import {
  ApiOperation,
  ApiOutcome,
  ClientErrorOperation,
  DiagnosticBatchEnvelope,
  DiagnosticEvent,
  SaveOperation,
  clampClsScore,
  clampDurationMs,
  sanitizeRequestId,
  toSafeErrorType,
} from './schema';

const MAX_EVENTS_PER_SESSION = 60;
const MAX_EVENTS_PER_BATCH = 10;
const MIN_FLUSH_INTERVAL_MS = 60_000;
const MAX_BODY_BYTES = 8 * 1024;

interface FetchLike {
  (input: string, init?: RequestInit): Promise<{ ok: boolean; status: number }>;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined' || !document.cookie) return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

export class WebDiagnosticsClient {
  private queue: DiagnosticEvent[] = [];
  private sessionSeq = 0;
  private signedIn = false;
  private serverEnabled = false;
  private emittedInSession = 0;
  private lastFlushAt = -Infinity;
  private flushing = false;
  private readonly now: () => number;
  private readonly fetcher: FetchLike;
  private readonly apiBaseUrl: () => string;

  constructor(opts?: {
    now?: () => number;
    fetcher?: FetchLike;
    apiBaseUrl?: () => string;
  }) {
    this.now = opts?.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.fetcher = opts?.fetcher ?? ((input, init) => fetch(input, init));
    this.apiBaseUrl =
      opts?.apiBaseUrl ??
      (() => (process.env.REACT_APP_API_BASE_URL || '').replace(/\/+$/, ''));

    subscribeDiagnosticsConsent((choice) => {
      if (choice !== 'granted') {
        this.clearQueueAndAdvance();
      }
    });
  }

  /** Set whether the server feature flag `client_diagnostics_enabled` is on. */
  setServerEnabled(enabled: boolean): void {
    this.serverEnabled = Boolean(enabled);
    if (!this.serverEnabled) {
      this.queue = [];
    }
  }

  /** Update signed-in state. Every account change or sign-out clears the queue and advances sessionSeq. */
  setSignedIn(signedIn: boolean): void {
    this.sessionSeq += 1;
    this.signedIn = signedIn;
    this.queue = [];
    this.emittedInSession = 0;
    this.lastFlushAt = -Infinity;
  }

  /** Capture a session token before starting an async operation to prevent cross-account late events. */
  captureSession(): number {
    return this.sessionSeq;
  }

  /** Current session token is still active, signed in, server-enabled, and consented. */
  private canAccept(sessionToken?: number): boolean {
    if (!this.signedIn || !this.serverEnabled || !isDiagnosticsConsented()) return false;
    if (sessionToken !== undefined && sessionToken !== this.sessionSeq) return false;
    if (this.emittedInSession >= MAX_EVENTS_PER_SESSION) return false;
    return true;
  }

  private clearQueueAndAdvance(): void {
    this.sessionSeq += 1;
    this.queue = [];
  }

  enqueue(event: DiagnosticEvent, sessionToken?: number): boolean {
    if (!this.canAccept(sessionToken)) return false;
    this.queue.push(event);
    this.emittedInSession += 1;
    if (this.queue.length >= MAX_EVENTS_PER_BATCH) {
      void this.flush();
    }
    return true;
  }

  recordApiCompleted(
    operation: ApiOperation,
    outcome: ApiOutcome,
    durationMs: number,
    opts?: { requestId?: string | null; sessionToken?: number }
  ): boolean {
    const dur = clampDurationMs(durationMs);
    if (dur === null) return false;
    const reqId = sanitizeRequestId(opts?.requestId);
    return this.enqueue(
      {
        name: 'api_completed',
        operation,
        platform: 'web',
        outcome,
        duration_ms: dur,
        ...(reqId ? { request_id: reqId } : {}),
      },
      opts?.sessionToken
    );
  }

  recordDashboardReady(
    outcome: 'success' | 'failed',
    durationMs: number,
    sessionToken?: number
  ): boolean {
    const dur = clampDurationMs(durationMs);
    if (dur === null) return false;
    return this.enqueue(
      {
        name: 'dashboard_ready',
        operation: 'dashboard',
        platform: 'web',
        outcome,
        duration_ms: dur,
      },
      sessionToken
    );
  }

  recordSaveOutcome(
    operation: SaveOperation,
    outcome: 'confirmed' | 'rejected' | 'unknown',
    durationMs: number,
    opts?: { requestId?: string | null; sessionToken?: number }
  ): boolean {
    const dur = clampDurationMs(durationMs);
    if (dur === null) return false;
    const reqId = sanitizeRequestId(opts?.requestId);
    const name =
      outcome === 'confirmed'
        ? 'save_confirmed'
        : outcome === 'rejected'
          ? 'save_failed'
          : 'save_unknown';
    return this.enqueue(
      {
        name,
        operation,
        platform: 'web',
        outcome,
        duration_ms: dur,
        ...(reqId ? { request_id: reqId } : {}),
      } as DiagnosticEvent,
      opts?.sessionToken
    );
  }

  recordWebVital(metric: 'lcp' | 'inp' | 'cls', value: number, sessionToken?: number): boolean {
    if (metric === 'cls') {
      const score = clampClsScore(value);
      if (score === null) return false;
      return this.enqueue(
        {
          name: 'web_vital',
          operation: 'cls',
          platform: 'web',
          outcome: 'measured',
          value: score,
          unit: 'score',
        },
        sessionToken
      );
    }
    const dur = clampDurationMs(value);
    if (dur === null) return false;
    return this.enqueue(
      {
        name: 'web_vital',
        operation: metric,
        platform: 'web',
        outcome: 'measured',
        duration_ms: dur,
        unit: 'ms',
      },
      sessionToken
    );
  }

  recordClientError(
    operation: ClientErrorOperation,
    err?: unknown,
    sessionToken?: number
  ): boolean {
    return this.enqueue(
      {
        name: 'client_error',
        operation,
        platform: 'web',
        outcome: 'failed',
        error_type: toSafeErrorType(err),
      },
      sessionToken
    );
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  async flush(force = false): Promise<boolean> {
    if (this.flushing || this.queue.length === 0) return false;
    if (!this.signedIn || !this.serverEnabled || !isDiagnosticsConsented()) {
      this.queue = [];
      return false;
    }

    const nowMs = this.now();
    if (!force && nowMs - this.lastFlushAt < MIN_FLUSH_INTERVAL_MS) {
      return false;
    }

    const batch = this.queue.splice(0, MAX_EVENTS_PER_BATCH);
    const envelope: DiagnosticBatchEnvelope = {
      schema_version: 1,
      events: batch,
    };
    const body = JSON.stringify(envelope);
    if (body.length > MAX_BODY_BYTES) {
      // Drop oversized batch silently rather than retrying.
      return false;
    }

    const url = `${this.apiBaseUrl()}/api/v1/telemetry/batch`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-TrackSpense-Client': 'web',
    };
    const csrf = readCookie('vs_csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;

    this.flushing = true;
    this.lastFlushAt = nowMs;
    try {
      const res = await this.fetcher(url, {
        method: 'POST',
        credentials: 'include',
        headers,
        body,
        keepalive: true,
      });
      if (res.status === 404) {
        // Endpoint disabled server-side; stop further collection for this session.
        this.serverEnabled = false;
        this.queue = [];
      }
      return res.ok;
    } catch {
      // Never retry, never trigger auth refresh, never throw into caller.
      return false;
    } finally {
      this.flushing = false;
    }
  }
}

export const webDiagnostics = new WebDiagnosticsClient();
