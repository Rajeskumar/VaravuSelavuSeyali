import { analytics } from '../../../core/analytics';
import type { Operation } from '../../../core/analytics';
import { RequestError } from '../../../core/api/request';
import { EventName, EventProperties } from './events';

/** Typed entry point: only catalog events with their closed properties compile. Never throws. */
export function track<N extends EventName>(name: N, properties: EventProperties<N>, operation?: Operation): boolean {
  return analytics.track(name, properties as Record<string, string>, operation);
}

type Failure = Pick<EventProperties<'login_failed'>, 'outcome' | 'error_code'>;

/**
 * Static status/type mapping only; the error text is never read or sent. A write whose result the
 * client could not confirm (lost reply, timeout, 5xx) is `unknown/outcome_unknown`, never a failure.
 */
export function safeFailure(error: unknown, write = false, cancelled = false): Failure {
  if (cancelled) return { outcome: 'cancelled', error_code: 'cancelled' };
  // The AI gating refusal (daily quota / spend cap / kill switch) is a quota outcome, not a generic failure.
  if ((error as { name?: unknown } | null | undefined)?.name === 'AiLimitError') return { outcome: 'failure', error_code: 'quota' };
  // RequestError (transport) and ApiError (groups) both carry a numeric `status` when the server answered.
  const raw = (error as { status?: unknown } | null | undefined)?.status;
  const status = typeof raw === 'number' ? raw : undefined;
  if (write && error instanceof RequestError && error.outcomeUnknown) return { outcome: 'unknown', error_code: 'outcome_unknown' };
  if (write && status === undefined && !(error instanceof RequestError)) return { outcome: 'unknown', error_code: 'unknown' };
  const code = status === 400 || status === 422 ? 'validation'
    : status === 401 ? 'unauthorized' : status === 403 ? 'forbidden'
      : status === 409 ? 'conflict' : status === 429 ? 'rate_limited'
        : status && status >= 500 ? 'server' : error instanceof RequestError || error instanceof TypeError ? 'network' : 'unknown';
  return code === 'unknown' ? { outcome: 'unknown', error_code: 'unknown' } : { outcome: 'failure', error_code: code };
}

/** Runs the operation; analytics can neither replace its result nor its error. */
export async function observe<T>(
  run: () => Promise<T>,
  emit: (result: T, operation: Operation) => void,
  failed?: (error: unknown, operation: Operation) => void,
  operation: Operation = analytics.beginOperation(),
): Promise<T> {
  let result: T;
  try { result = await run(); } catch (error) {
    try { failed?.(error, operation); } catch { /* never replace the application error */ }
    throw error;
  }
  try { emit(result, operation); } catch { /* never replace a successful result */ }
  return result;
}

/** One success event after the acknowledgement; failures are left to the caller's own handling. */
export function confirmed<T, N extends EventName>(
  run: () => Promise<T>, name: N, properties: EventProperties<N>,
  accepted: (result: T) => boolean = () => true, operation?: Operation,
): Promise<T> {
  return observe(run, (result, op) => { if (accepted(result)) track(name, properties, op); }, undefined, operation);
}

/** Like `confirmed`, but also reports a definite failure/unknown outcome as one terminal event. */
export function terminal<T, S extends EventName, F extends EventName>(
  run: () => Promise<T>,
  success: { name: S; properties: EventProperties<S>; accepted?: (result: T) => boolean },
  failure: { name: F; properties: (f: Failure) => EventProperties<F> },
  write = true, operation?: Operation,
): Promise<T> {
  return observe(
    run,
    (result, op) => {
      if (success.accepted && !success.accepted(result)) track(failure.name, failure.properties({ outcome: 'unknown', error_code: 'outcome_unknown' }), op);
      else track(success.name, success.properties, op);
    },
    (error, op) => track(failure.name, failure.properties(safeFailure(error, write)), op),
    operation,
  );
}

export type CaptureMethod = EventProperties<'expense_created'>['entry_method'];
export interface ExpenseCapture {
  method: CaptureMethod;
  operation?: Operation;
  categoryDisposition?: 'accepted' | 'overridden';
}

/** Create-expense wrapper: no capture context, no events (retries and background callers stay silent). */
export function expenseCreation<T>(
  run: () => Promise<T>, capture: ExpenseCapture | undefined, scope: 'personal' | 'group',
  persisted: (result: T) => boolean = () => true,
): Promise<T> {
  if (!capture) return run();
  const { method: entry_method, categoryDisposition } = capture;
  const failed = (failure: Failure, op: Operation) =>
    track('expense_creation_failed', { entry_method, expense_scope: scope, ...failure }, op);
  return observe(run, (result, op) => {
    if (!persisted(result)) { failed({ outcome: 'unknown', error_code: 'outcome_unknown' }, op); return; }
    if (scope === 'personal') track('expense_created', { entry_method, expense_scope: 'personal' }, op);
    else track('group_expense_created', { entry_method, expense_scope: 'group' }, op);
    if (categoryDisposition) {
      track(categoryDisposition === 'accepted' ? 'category_suggestion_accepted' : 'category_suggestion_overridden', {}, op);
    }
  }, (error, op) => failed(safeFailure(error, true), op), capture.operation);
}

export function categoryDisposition(suggested: string | undefined, selected: string): 'accepted' | 'overridden' | undefined {
  return suggested === undefined ? undefined : suggested === selected ? 'accepted' : 'overridden';
}

export type DurationBucket = NonNullable<EventProperties<'receipt_parse_completed'>['duration_bucket']>;
/** Coarse bucket from a monotonic delta; the raw duration is never sent. */
export function durationBucket(ms: number): DurationBucket {
  return ms < 1000 ? 'under_1s' : ms < 5000 ? '1_to_5s' : ms < 15000 ? '5_to_15s' : ms < 60000 ? '15_to_60s' : 'over_60s';
}
