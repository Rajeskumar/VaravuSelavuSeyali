import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class DashboardPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto('/dashboard');
  }

  get totalAmount() {
    return this.page.getByTestId('true-total-hero-amount');
  }

  get recentSectionHeading() {
    return this.page.getByText('RECENT', { exact: true });
  }

  get seeAllLink() {
    return this.page.getByText('See all ›');
  }

  get emptyStateTitle() {
    return this.page.getByText('No expenses yet');
  }

  get addFirstExpenseAction() {
    return this.page.getByRole('button', { name: 'Add your first expense' });
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page.getByText('Loading dashboard...')).toHaveCount(0, { timeout: 20_000 });
    await expect(this.page.getByText('Failed to load dashboard data.')).toHaveCount(0);
  }

  /** Parses "$1,234.56" / "-$12.00" / "−$12.00" back to a number, for exact-total assertions. */
  async totalAmountValue(): Promise<number> {
    const text = (await this.totalAmount.textContent()) || '';
    const negative = text.includes('-') || text.includes('−');
    const numeric = text.replace(/[^0-9.]/g, '');
    return (negative ? -1 : 1) * parseFloat(numeric || '0');
  }
}
