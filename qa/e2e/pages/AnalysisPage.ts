import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class AnalysisPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoTab(tab?: 'overview' | 'items' | 'merchants' | 'budgets' | 'cards'): Promise<void> {
    await this.page.goto(tab ? `/analysis?tab=${tab}` : '/analysis');
  }

  tab(label: 'Overview' | 'Items' | 'Merchants' | 'Budgets' | 'Cards') {
    return this.page.getByRole('tab', { name: label }).or(this.page.getByText(label, { exact: true }));
  }
}
