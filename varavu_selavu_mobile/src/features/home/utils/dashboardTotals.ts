export interface AnalysisGroupSummary {
  group_id: string;
  name: string;
  my_share: number;
  i_paid: number;
  group_total: number;
  my_balance: number;
}

export interface SpendBreakdown {
  personal: number;
  group_share: number;
  /** What the user paid across every group (any status); older servers omit it. */
  i_paid_share?: number;
}

/**
 * TrackSpense v3 dashboard hero math, ported from the web app's
 * `varavu_selavu_ui/src/components/dashboard/TrueTotalHero.tsx`. Pure functions only — the
 * screen-level wiring (which lens is selected, when to show the toggle) lives in HomeScreen.tsx.
 */

/** Sums personal spend + each group's `my_share` — the default "My expenses" lens. Callers
 * should pass `spend_breakdown.personal` (not `total_expenses`) so the personal portion doesn't
 * double-count group spend already folded into a `scope=combined` total. */
export function computeMyExpensesTotal(
  personal: number,
  groupSummaries: AnalysisGroupSummary[],
  spendBreakdown?: SpendBreakdown | null,
): number {
  // The server's group share counts every group (deleted, archived and left ones too), like
  // Analysis's total; group_summaries lists only active groups, so summing it undercounts
  // (TS-QA-101). Summaries are the fallback only for a response without a breakdown.
  if (spendBreakdown) return round2(personal + spendBreakdown.group_share);
  return groupSummaries.reduce((sum, g) => sum + g.my_share, personal);
}

/** "I Paid" lens: personal spend + what the user actually fronted in each group (`i_paid`),
 * vs. `computeMyExpensesTotal`'s "my share" of it. */
export function computeIPaidTotal(
  personal: number,
  groupSummaries: AnalysisGroupSummary[],
  spendBreakdown?: SpendBreakdown | null,
): number {
  if (spendBreakdown && spendBreakdown.i_paid_share != null) return round2(personal + spendBreakdown.i_paid_share);
  return groupSummaries.reduce((sum, g) => sum + g.i_paid, personal);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "Net with people": sum of `my_balance` across every group — positive means people owe the
 * user overall, negative means the user owes overall. */
export function computeNetWithPeople(groupSummaries: AnalysisGroupSummary[]): number {
  return groupSummaries.reduce((sum, g) => sum + g.my_balance, 0);
}
