/**
 * Mobile Performance Diagnostics client (TS-OBS-001 AC-08, AC-09).
 *
 * Guarantees:
 * - Lives in `core/observability/` (imports only `core/`, never `features/` or `app/`).
 * - No pre-consent capture or retrospective replay.
 * - Scoped to signed-in journeys only; session changes/logout/withdrawal immediately
 *   clear queued events and invalidate late in-flight measurements from prior sessions.
 * - Max 60 events/session, max 10 events/batch, max 1 flush/minute, no durable queue.
 * - Calls only `${getApiBaseUrl()}/api/v1/telemetry/batch` with `Authorization: Bearer`
 *   and `credentials: 'omit'`. Never triggers auth refresh, never retries, never blocks.
 */

import { Platform } from 'react-native';
import { getApiBaseUrl } from '../api/baseUrl';
import {
  isDiagnosticsConsented,
  subscribeDiagnosticsConsent,
} from './consent';
import {
  ApiOperation,
  ApiOutcome,
  ClientErrorOperation,
  MobileDiagnosticBatchEnvelope,
  MobileDiagnosticEvent,
  MobileDiagnosticPlatform,
  SaveOperation,
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

function defaultPlatform(): MobileDiagnosticPlatform {
  return Platform.OS === 'android' ? 'android' : 'ios';
}

export class MobileDiagnosticsClient {
  private queue: MobileDiagnosticEvent[] = [];
  private sessionSeq = 0;
  private accessToken: string | null = null;
  private serverEnabled = false;
  private emittedInSession = 0;
  private lastFlushAt = -Infinity;
  private flushing = false;
  private readonly now: () => number;
  private readonly fetcher: FetchLike;
  private readonly apiBaseUrl: () => string;
  private readonly platform: () => MobileDiagnosticPlatform;

  constructor(opts?: {
    now?: () => number;
    fetcher?: FetchLike;
    apiBaseUrl?: () => string;
    platform?: () => MobileDiagnosticPlatform;
  }) {
    this.now =
      opts?.now ??
      (() => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()));
    this.fetcher = opts?.fetcher ?? ((input, init) => fetch(input, init));
    this.apiBaseUrl = opts?.apiBaseUrl ?? getApiBaseUrl;
    this.platform = opts?.platform ?? defaultPlatform;

    subscribeDiagnosticsConsent((s) => {
      if (s.choice !== 'granted') {
        this.clearQueueAndAdvance();
      }
    });
  }

  setServerEnabled(enabled: boolean): void {
    this.serverEnabled = Boolean(enabled);
    if (!this.serverEnabled) {
      this.queue = [];
    }
  }

  /** Set active access token (null on logout/account switch). Always clears prior queue and advances sessionSeq. */
  setSessionToken(accessToken: string | null): void {
    this.sessionSeq += 1;
    this.accessToken = accessToken;
    this.queue = [];
    this.emittedInSession = 0;
    this.lastFlushAt = -Infinity;
  }

  captureSession(): number {
    return this.sessionSeq;
  }

  private clearQueueAndAdvance(): void {
    this.sessionSeq += 1;
    this.queue = [];
  }

  private canAccept(sessionToken?: number): boolean {
    if (!this.accessToken || !this.serverEnabled || !isDiagnosticsConsented()) return false;
    if (sessionToken !== undefined && sessionToken !== this.sessionSeq) return false;
    if (this.emittedInSession >= MAX_EVENTS_PER_SESSION) return false;
    return true;
  }

  enqueue(event: MobileDiagnosticEvent, sessionToken?: number): boolean {
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
        platform: this.platform(),
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
        platform: this.platform(),
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
        platform: this.platform(),
        outcome,
        duration_ms: dur,
        ...(reqId ? { request_id: reqId } : {}),
      } as MobileDiagnosticEvent,
      opts?.sessionToken
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
        platform: this.platform(),
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
    if (!this.accessToken || !this.serverEnabled || !isDiagnosticsConsented()) {
      this.queue = [];
      return false;
    }

    const nowMs = this.now();
    if (!force && nowMs - this.lastFlushAt < MIN_FLUSH_INTERVAL_MS) {
      return false;
    }

    const batch = this.queue.splice(0, MAX_EVENTS_PER_BATCH);
    const envelope: MobileDiagnosticBatchEnvelope = {
      schema_version: 1,
      events: batch,
    };
    const body = JSON.stringify(envelope);
    if (body.length > MAX_BODY_BYTES) {
      return false;
    }

    const url = `${this.apiBaseUrl()}/api/v1/telemetry/batch`;
    const token = this.accessToken;
    this.flushing = true;
    this.lastFlushAt = nowMs;
    try {
      const res = await this.fetcher(url, {
        method: 'POST',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body,
      });
      if (res.status === 404) {
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

export const mobileDiagnostics = new MobileDiagnosticsClient();
