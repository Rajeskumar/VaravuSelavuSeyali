import { analytics } from './browser';
import { Operation } from './client';
import { EventName, EventProperties } from './events';

type Failure = Pick<EventProperties<'login_failed'>, 'outcome' | 'error_code'>;
export function safeFailure(error: unknown, write = false, cancelled = false): Failure {
  if (cancelled) return { outcome: 'cancelled', error_code: 'cancelled' };
  const status = error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : undefined;
  if (write && (status === undefined || status >= 500 || (error instanceof Error && 'outcomeUnknown' in error && error.outcomeUnknown === true))) {
    return { outcome: 'unknown', error_code: 'outcome_unknown' };
  }
  const code = status === 400 || status === 422 ? 'validation'
    : status === 401 ? 'unauthorized' : status === 403 ? 'forbidden'
      : status === 409 ? 'conflict' : status === 429 ? 'rate_limited'
        : status && status >= 500 ? 'server' : error instanceof TypeError ? 'network' : 'unknown';
  return { outcome: 'failure', error_code: code };
}

export async function observe<T>(run: () => Promise<T>, emit: (result: T, operation: Operation) => void,
  failed?: (error: unknown, operation: Operation) => void, operation = analytics.beginOperation()): Promise<T> {
  let result: T;
  try { result = await run(); } catch (error) {
    try { failed?.(error, operation); } catch { /* Do not replace the application error. */ }
    throw error;
  }
  try { emit(result, operation); } catch { /* Do not replace a successful application result. */ }
  return result;
}

export function confirmed<T, N extends EventName>(run: () => Promise<T>, name: N, props: EventProperties<N>,
  accepted: (result: T) => boolean = () => true, operation?: Operation) {
  return observe(run, (result, op) => { if (accepted(result)) analytics.track(name, props, op); }, undefined, operation);
}

export type CaptureMethod = EventProperties<'expense_created'>['entry_method'];
export type ExpenseCapture = { method: CaptureMethod; operation?: Operation; categoryDisposition?: 'accepted' | 'overridden' };
export function expenseCreation<T>(run: () => Promise<T>, capture: ExpenseCapture | undefined,
  scope: 'personal' | 'group', persisted: (result: T) => boolean) {
  if (!capture) return run();
  const { method: entry_method, categoryDisposition } = capture;
  const failed = (failure: Failure, op: Operation) =>
    analytics.track('expense_creation_failed', { entry_method, expense_scope: scope, ...failure }, op);
  return observe(run, (result, op) => {
    if (!persisted(result)) {
      failed({ outcome: 'unknown', error_code: 'outcome_unknown' }, op);
      return;
    }
    if (scope === 'personal') analytics.track('expense_created', { entry_method, expense_scope: scope }, op);
    else analytics.track('group_expense_created', { entry_method, expense_scope: scope }, op);
    if (categoryDisposition) analytics.track(categoryDisposition === 'accepted'
      ? 'category_suggestion_accepted' : 'category_suggestion_overridden', {}, op);
  }, (error, op) => failed(safeFailure(error, true), op), capture.operation);
}

export function categoryDisposition(suggested: string | undefined, selected: string) {
  return suggested === undefined ? undefined : suggested === selected ? 'accepted' as const : 'overridden' as const;
}
