export interface AnalysisGroupSummary {
  group_id: string;
  name: string;
  my_share: number;
  i_paid: number;
  group_total: number;
  my_balance: number;
}

/**
 * TrackSpense v3 dashboard hero math, ported from the web app's
 * `varavu_selavu_ui/src/components/dashboard/TrueTotalHero.tsx`. Pure functions only — the
 * screen-level wiring (which lens is selected, when to show the toggle) lives in HomeScreen.tsx.
 */

/** Sums personal spend + each group's `my_share` — the default "My expenses" lens. Callers
 * should pass `spend_breakdown.personal` (not `total_expenses`) so the personal portion doesn't
 * double-count group spend already folded into a `scope=combined` total. */
export function computeMyExpensesTotal(personal: number, groupSummaries: AnalysisGroupSummary[]): number {
  return groupSummaries.reduce((sum, g) => sum + g.my_share, personal);
}

/** "I Paid" lens: personal spend + what the user actually fronted in each group (`i_paid`),
 * vs. `computeMyExpensesTotal`'s "my share" of it. */
export function computeIPaidTotal(personal: number, groupSummaries: AnalysisGroupSummary[]): number {
  return groupSummaries.reduce((sum, g) => sum + g.i_paid, personal);
}

/** "Net with people": sum of `my_balance` across every group — positive means people owe the
 * user overall, negative means the user owes overall. */
export function computeNetWithPeople(groupSummaries: AnalysisGroupSummary[]): number {
  return groupSummaries.reduce((sum, g) => sum + g.my_balance, 0);
}
