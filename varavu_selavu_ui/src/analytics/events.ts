/** Browser-independent contract. Values are deliberately closed, including error codes.
 * Registering a schema does not instrument a feature: Phase 3 owns the producers. */
const methods = ['manual', 'quick_log', 'receipt', 'recurring', 'undo'] as const;
const auth = ['password', 'google'] as const;
const duration = ['under_1s', '1_to_5s', '5_to_15s', '15_to_60s', 'over_60s'] as const;
const failure = {
  outcome: ['failure', 'unknown', 'cancelled'],
  error_code: ['validation', 'unauthorized', 'forbidden', 'rate_limited', 'quota', 'network', 'timeout', 'server', 'conflict', 'cancelled', 'outcome_unknown', 'unknown'],
} as const;
const scope = ['personal', 'group'] as const;
function event<F extends string, P extends Record<string, readonly string[]>>(feature: F, properties: P) {
  return { feature, properties };
}
export const events = {
  signup_started: event('auth', { authentication_method: auth }),
  sign_up: event('auth', { authentication_method: ['password'] as const }),
  signup_failed: event('auth', { authentication_method: ['password'] as const, ...failure }),
  login: event('auth', { authentication_method: auth }),
  login_failed: event('auth', { authentication_method: auth, ...failure }),
  logout: event('auth', {}),
  expense_creation_started: event('expenses', { entry_method: methods, expense_scope: scope }),
  expense_created: event('expenses', { entry_method: methods, expense_scope: ['personal'] as const }),
  expense_creation_failed: event('expenses', { entry_method: methods, expense_scope: scope, ...failure }),
  expense_updated: event('expenses', { expense_scope: ['personal'] as const }),
  expense_deleted: event('expenses', { expense_scope: scope }),
  category_suggestion_completed: event('categorization', { duration_bucket: duration }),
  category_suggestion_failed: event('categorization', { ...failure, duration_bucket: duration }),
  category_suggestion_accepted: event('categorization', {}),
  category_suggestion_overridden: event('categorization', {}),
  receipt_parse_started: event('receipts', {}),
  receipt_parse_completed: event('receipts', { duration_bucket: duration }),
  receipt_parse_failed: event('receipts', { ...failure, duration_bucket: duration }),
  group_created: event('groups', {}),
  group_member_invited: event('groups', {}),
  group_invitation_accepted: event('groups', {}),
  group_expense_created: event('groups', { entry_method: methods, expense_scope: ['group'] as const }),
  group_expense_updated: event('groups', { expense_scope: ['group'] as const }),
  settlement_completed: event('groups', {}),
  ai_analyst_opened: event('ai_analyst', {}),
  ai_query_started: event('ai_analyst', {}),
  ai_query_completed: event('ai_analyst', { duration_bucket: duration }),
  ai_query_failed: event('ai_analyst', { ...failure, duration_bucket: duration }),
  recurring_template_changed: event('recurring', { action: ['saved', 'paused', 'resumed', 'deleted'] as const }),
  recurring_run_completed: event('recurring', { action: ['executed', 'confirmed'] as const }),
  analysis_viewed: event('analysis', { view: ['overview', 'items', 'merchants', 'budgets', 'cards'] as const }),
  expense_filter_applied: event('expenses', { filter_type: ['search', 'period', 'scope', 'tag'] as const }),
  data_export_completed: event('settings', { export_type: ['expenses_csv', 'account_json', 'group_csv'] as const }),
} as const;
export type EventName = keyof typeof events;
type Fields<N extends EventName> = typeof events[N]['properties'];
type Value<T> = T extends readonly string[] ? T[number] : never;
export type EventProperties<N extends EventName> = {
  [K in Exclude<keyof Fields<N>, 'duration_bucket'>]: Value<Fields<N>[K]>;
} & { duration_bucket?: 'duration_bucket' extends keyof Fields<N> ? Value<Fields<N>['duration_bucket' & keyof Fields<N>]> : never };

/** Reject whole events, including getters/symbols/extra keys, without logging their contents. */
export function validateEvent(name: unknown, value: unknown): Record<string, string> | null {
  try {
    if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(events, name)) return null;
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const schema = events[name as EventName].properties as Record<string, readonly string[]>;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(value).length > Object.keys(schema).length) return null;
    const result: Record<string, string> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(schema, key)) return null;
      const d = descriptors[key];
      if (!d || !('value' in d) || typeof d.value !== 'string' || !schema[key].includes(d.value)) return null;
      result[key] = d.value;
    }
    for (const key of Object.keys(schema)) {
      if (key !== 'duration_bucket' && !(key in result)) return null;
    }
    if (result.outcome === 'unknown' && result.error_code !== 'outcome_unknown' && result.error_code !== 'unknown') return null;
    if (result.error_code === 'outcome_unknown' && result.outcome !== 'unknown') return null;
    if ((result.outcome === 'cancelled') !== (result.error_code === 'cancelled')) return null;
    return result;
  } catch { return null; }
}
