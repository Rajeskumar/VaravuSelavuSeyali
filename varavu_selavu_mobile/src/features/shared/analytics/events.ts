/**
 * TrackSpense event table for mobile. Generated from docs/analytics/catalog.v1.json (the shared contract with
 * web); `events.test.ts` fails if the two drift. Core takes this table as data, so it knows no event names.
 */
import { EventTable } from '../../../core/analytics/types';

export const trackSpenseEvents = {
  signup_started: {
    feature: 'auth',
    properties: {
      authentication_method: { values: ['password', 'google'] },
    },
  },
  sign_up: {
    feature: 'auth',
    properties: {
      authentication_method: { values: ['password'] },
    },
  },
  signup_failed: {
    feature: 'auth',
    properties: {
      authentication_method: { values: ['password'] },
      outcome: { values: ['failure', 'unknown', 'cancelled'] },
      error_code: { values: ['validation', 'unauthorized', 'forbidden', 'rate_limited', 'quota', 'network', 'timeout', 'server', 'conflict', 'cancelled', 'outcome_unknown', 'unknown'] },
    },
  },
  login: {
    feature: 'auth',
    properties: {
      authentication_method: { values: ['password', 'google'] },
    },
  },
  login_failed: {
    feature: 'auth',
    properties: {
      authentication_method: { values: ['password', 'google'] },
      outcome: { values: ['failure', 'unknown', 'cancelled'] },
      error_code: { values: ['validation', 'unauthorized', 'forbidden', 'rate_limited', 'quota', 'network', 'timeout', 'server', 'conflict', 'cancelled', 'outcome_unknown', 'unknown'] },
    },
  },
  logout: {
    feature: 'auth',
    properties: {},
  },
  expense_created: {
    feature: 'expenses',
    properties: {
      entry_method: { values: ['manual', 'quick_log', 'receipt', 'recurring', 'undo'] },
      expense_scope: { values: ['personal'] },
    },
  },
  expense_creation_failed: {
    feature: 'expenses',
    properties: {
      entry_method: { values: ['manual', 'quick_log', 'receipt', 'recurring', 'undo'] },
      expense_scope: { values: ['personal', 'group'] },
      outcome: { values: ['failure', 'unknown', 'cancelled'] },
      error_code: { values: ['validation', 'unauthorized', 'forbidden', 'rate_limited', 'quota', 'network', 'timeout', 'server', 'conflict', 'cancelled', 'outcome_unknown', 'unknown'] },
    },
  },
  expense_updated: {
    feature: 'expenses',
    properties: {
      expense_scope: { values: ['personal'] },
    },
  },
  expense_deleted: {
    feature: 'expenses',
    properties: {
      expense_scope: { values: ['personal', 'group'] },
    },
  },
  category_suggestion_completed: {
    feature: 'categorization',
    properties: {
      duration_bucket: { values: ['under_1s', '1_to_5s', '5_to_15s', '15_to_60s', 'over_60s'], optional: true },
    },
  },
  category_suggestion_failed: {
    feature: 'categorization',
    properties: {
      outcome: { values: ['failure', 'unknown', 'cancelled'] },
      error_code: { values: ['validation', 'unauthorized', 'forbidden', 'rate_limited', 'quota', 'network', 'timeout', 'server', 'conflict', 'cancelled', 'outcome_unknown', 'unknown'] },
      duration_bucket: { values: ['under_1s', '1_to_5s', '5_to_15s', '15_to_60s', 'over_60s'], optional: true },
    },
  },
  category_suggestion_accepted: {
    feature: 'categorization',
    properties: {},
  },
  category_suggestion_overridden: {
    feature: 'categorization',
    properties: {},
  },
  receipt_parse_started: {
    feature: 'receipts',
    properties: {},
  },
  receipt_parse_completed: {
    feature: 'receipts',
    properties: {
      duration_bucket: { values: ['under_1s', '1_to_5s', '5_to_15s', '15_to_60s', 'over_60s'], optional: true },
    },
  },
  receipt_parse_failed: {
    feature: 'receipts',
    properties: {
      outcome: { values: ['failure', 'unknown', 'cancelled'] },
      error_code: { values: ['validation', 'unauthorized', 'forbidden', 'rate_limited', 'quota', 'network', 'timeout', 'server', 'conflict', 'cancelled', 'outcome_unknown', 'unknown'] },
      duration_bucket: { values: ['under_1s', '1_to_5s', '5_to_15s', '15_to_60s', 'over_60s'], optional: true },
    },
  },
  group_created: {
    feature: 'groups',
    properties: {},
  },
  group_member_invited: {
    feature: 'groups',
    properties: {},
  },
  group_invitation_accepted: {
    feature: 'groups',
    properties: {},
  },
  group_expense_created: {
    feature: 'groups',
    properties: {
      entry_method: { values: ['manual', 'quick_log', 'receipt', 'recurring', 'undo'] },
      expense_scope: { values: ['group'] },
    },
  },
  group_expense_updated: {
    feature: 'groups',
    properties: {
      expense_scope: { values: ['group'] },
    },
  },
  settlement_completed: {
    feature: 'groups',
    properties: {},
  },
  ai_analyst_opened: {
    feature: 'ai_analyst',
    properties: {},
  },
  ai_query_started: {
    feature: 'ai_analyst',
    properties: {},
  },
  ai_query_completed: {
    feature: 'ai_analyst',
    properties: {
      duration_bucket: { values: ['under_1s', '1_to_5s', '5_to_15s', '15_to_60s', 'over_60s'], optional: true },
    },
  },
  ai_query_failed: {
    feature: 'ai_analyst',
    properties: {
      outcome: { values: ['failure', 'unknown', 'cancelled'] },
      error_code: { values: ['validation', 'unauthorized', 'forbidden', 'rate_limited', 'quota', 'network', 'timeout', 'server', 'conflict', 'cancelled', 'outcome_unknown', 'unknown'] },
      duration_bucket: { values: ['under_1s', '1_to_5s', '5_to_15s', '15_to_60s', 'over_60s'], optional: true },
    },
  },
  recurring_template_changed: {
    feature: 'recurring',
    properties: {
      action: { values: ['saved', 'paused', 'resumed', 'deleted'] },
    },
  },
  recurring_run_completed: {
    feature: 'recurring',
    properties: {
      action: { values: ['executed', 'confirmed'] },
    },
  },
  screen_view: {
    feature: 'navigation',
    properties: {
      screen_name: { values: ['login', 'register', 'forgot_password', 'home', 'expenses', 'groups', 'group_detail', 'join_group', 'insights', 'ask', 'activity', 'profile', 'recurring', 'item_detail', 'merchant_detail', 'cards', 'tags', 'about', 'feedback', 'security', 'delete_account', 'privacy'] },
    },
  },
  receipt_image_selected: {
    feature: 'receipts',
    properties: {
      source: { values: ['camera', 'library'] },
    },
  },
  permission_result: {
    feature: 'device',
    properties: {
      permission: { values: ['camera', 'photos', 'notifications'] },
      result: { values: ['granted', 'denied', 'limited'] },
    },
  },
  deep_link_opened: {
    feature: 'navigation',
    properties: {
      link_type: { values: ['group_invite', 'group'] },
    },
  },
  notification_opened: {
    feature: 'navigation',
    properties: {
      notification_type: { values: ['group_activity'] },
    },
  },
} as const satisfies EventTable;

export type EventName = Exclude<keyof typeof trackSpenseEvents, 'screen_view'>;
type Props<N extends EventName> = (typeof trackSpenseEvents)[N]['properties'];
type Value<P> = P extends { values: readonly (infer V)[] } ? V : never;
type OptionalKeys<N extends EventName> = { [K in keyof Props<N>]: Props<N>[K] extends { optional: true } ? K : never }[keyof Props<N>];
/** Closed-enum properties only; optional ones are those the catalog marks optional. */
export type EventProperties<N extends EventName> =
  { [K in Exclude<keyof Props<N>, OptionalKeys<N>>]: Value<Props<N>[K]> } &
  { [K in OptionalKeys<N>]?: Value<Props<N>[K]> };

/** One terminal outcome per operation: the creation family, the sign-up/login pairs and *_completed/*_failed. */
export function terminalFamily(name: string): string {
  if (name === 'sign_up' || name === 'signup_failed') return 'signup-terminal';
  if (name === 'login' || name === 'login_failed') return 'login-terminal';
  if (name === 'category_suggestion_accepted' || name === 'category_suggestion_overridden') return 'category-disposition';
  if (name === 'expense_created' || name === 'group_expense_created' || name === 'expense_creation_failed') return 'expense-terminal';
  return /_(completed|failed)$/.test(name) ? name.replace(/_(completed|failed)$/, '-terminal') : name;
}

/** A failure must carry a consistent outcome / error_code pair (same rules as web). */
export function eventInvariant(_name: string, r: Record<string, string>): boolean {
  if (r.outcome === 'unknown' && r.error_code !== 'outcome_unknown' && r.error_code !== 'unknown') return false;
  if (r.error_code === 'outcome_unknown' && r.outcome !== 'unknown') return false;
  if ((r.outcome === 'cancelled') !== (r.error_code === 'cancelled')) return false;
  return true;
}
