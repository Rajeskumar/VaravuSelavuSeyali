import * as fs from 'fs';
import * as path from 'path';
import { qaLabel, QA_TAG } from '../helpers/test-data.helper';

export interface DeterministicExpenseSeed {
  description: string;
  category: string;
  cost: number;
}

const raw: DeterministicExpenseSeed[] = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'test-data', 'deterministic-expenses.json'), 'utf-8'),
);

/**
 * Category names get the run's QA tag appended (`taggedCategory`) so a calculation test's
 * exact-total assertion can't be polluted by another test file creating a plain "Groceries"/
 * "Food & Dining" expense for the same shared primary persona at the same time — Playwright
 * runs spec files in parallel by default, and every API/e2e test in this run shares one
 * primaryApi identity (see e2e/fixtures/auth.fixture.ts), so category names must be
 * collision-proof, not just descriptions.
 */
export function taggedCategory(originalCategory: string): string {
  return `${originalCategory} ${QA_TAG}`;
}

/**
 * Same fixed amounts/categories every run (so hand-computed totals stay valid), with a
 * fresh QA_E2E_-tagged, run-unique description AND category each time.
 */
export function deterministicExpenseSeeds(): DeterministicExpenseSeed[] {
  return raw.map((e) => ({ ...e, description: qaLabel(e.description), category: taggedCategory(e.category) }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Sum across every seed — safe to compare against the sum of just this run's tagged categories in category_totals (not against whole-account total_expenses, which other parallel tests also contribute to). */
export const EXPECTED_TOTAL = round2(raw.reduce((sum, e) => sum + e.cost, 0));

/** Keyed by the ORIGINAL category name — callers apply taggedCategory() to match against a live response. */
export const EXPECTED_CATEGORY_TOTALS: Record<string, number> = raw.reduce((acc, e) => {
  acc[e.category] = round2((acc[e.category] || 0) + e.cost);
  return acc;
}, {} as Record<string, number>);
