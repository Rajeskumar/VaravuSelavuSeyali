import { test, expect } from '../../fixtures/auth.fixture';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';
import { dismissCookieConsent } from '../../helpers/responsive.helper';
import { env } from '../../helpers/env';

// Backlog B-08 / UAT-REC-001..005 (docs/qa/06-automation-strategy.md). Product rule (2026-11-22):
// a recurring template adds at most one expense per month; "Run now" twice warns instead of
// duplicating; earlier months are added by hand.
//
// Templates are created starting next month and deleted afterwards: a template that is *due* would
// make the load-time prompt open over every other test's page (the prompt test stubs the due list).
// Serial because the tests share one template list and pick cards with `.first()`.
test.describe.configure({ mode: 'serial' });


function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test.describe('recurring expenses (UI) @regression', () => {
  const createdTemplateIds: string[] = [];

  async function makeTemplate(primaryApi: any, over: Record<string, unknown> = {}) {
    const description = qaLabel(`recurring_${uniqueSuffix()}`);
    const res = await primaryApi.post('/api/v1/recurring/upsert', {
      data: { description, category: 'Groceries', day_of_month: 1, default_cost: 40, start_date_iso: iso(new Date()), status: 'Active', ...over },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = await res.json();
    createdTemplateIds.push(body.id);
    return { description, id: body.id as string };
  }

  async function countExpenses(primaryApi: any, description: string): Promise<number> {
    const body = await primaryApi.listExpenses();
    return (body.items || []).filter((e: any) => e.description === description).length;
  }

  test.afterEach(async ({ primaryApi }) => {
    for (const id of createdTemplateIds.splice(0)) await primaryApi.delete(`/api/v1/recurring/templates/${id}`);
  });

  async function openRecurringTab(page: any) {
    await page.goto('/expenses?tab=recurring');
    await dismissCookieConsent(page);
  }

  test('the Recurring tab lists a template and Run now logs it once', async ({ page, primaryApi }) => {
    // Start next month so the load-time "due" prompt doesn't open over this page.
    const future = new Date(); future.setMonth(future.getMonth() + 1);
    const { description } = await makeTemplate(primaryApi, { start_date_iso: iso(future) });

    await openRecurringTab(page);
    const card = page.getByText(description).first();
    await expect(card).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Run now' }).first().click();
    await expect(page.getByText('Recurring expense logged')).toBeVisible({ timeout: 15_000 });
    expect(await countExpenses(primaryApi, description)).toBe(1);
  });

  test('Run now twice in the same month warns and does not add a second expense', async ({ page, primaryApi }) => {
    const future = new Date(); future.setMonth(future.getMonth() + 1);
    const { description } = await makeTemplate(primaryApi, { start_date_iso: iso(future) });

    await openRecurringTab(page);
    await expect(page.getByText(description).first()).toBeVisible({ timeout: 15_000 });

    const runNow = page.getByRole('button', { name: 'Run now' }).first();
    await runNow.click();
    await expect(page.getByText('Recurring expense logged')).toBeVisible({ timeout: 15_000 });
    // The card shows "Logged" for ~2s; wait for the button to come back, then press again.
    await expect(runNow).toBeVisible({ timeout: 10_000 });
    await runNow.click();

    await expect(page.getByText(/Already added for this month/)).toBeVisible({ timeout: 15_000 });
    expect(await countExpenses(primaryApi, description)).toBe(1);
  });

  test('a paused template cannot be run and the switch resumes it', async ({ page, primaryApi }) => {
    const future = new Date(); future.setMonth(future.getMonth() + 1);
    const { description } = await makeTemplate(primaryApi, { start_date_iso: iso(future), status: 'Paused' });

    await openRecurringTab(page);
    await expect(page.getByText(description).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Run now' })).toHaveCount(0);

    await page.getByRole('switch').first().click();
    await expect(page.getByRole('button', { name: 'Run now' }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('deleting a template asks first and then removes it', async ({ page, primaryApi }) => {
    const future = new Date(); future.setMonth(future.getMonth() + 1);
    const { description } = await makeTemplate(primaryApi, { start_date_iso: iso(future) });

    await openRecurringTab(page);
    await expect(page.getByText(description).first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Template options' }).first().click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete template?' });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText(description).first()).toBeVisible();

    await page.getByRole('button', { name: 'Template options' }).first().click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('dialog', { name: 'Delete template?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(description)).toHaveCount(0, { timeout: 15_000 });
  });

  test('the due prompt confirms every missed month, and Dismiss logs nothing', async ({ page, browser }) => {
    // The due list is stubbed: a real due template for the shared primary persona would pop this
    // prompt over every other test that loads a page while it exists.
    const due = [
      { template_id: 'tpl-a', date_iso: '2026-10-01', description: 'QA Rent', category: 'Rent', suggested_cost: 100 },
      { template_id: 'tpl-a', date_iso: '2026-11-01', description: 'QA Rent', category: 'Rent', suggested_cost: 100 },
    ];
    const confirms: any[] = [];
    const stub = async (p: any) => {
      await p.route('**/api/v1/recurring/due**', (route: any) => route.fulfill({ json: due }));
      await p.route('**/api/v1/recurring/confirm', async (route: any) => {
        confirms.push(JSON.parse(route.request().postData() || '{}'));
        await route.fulfill({ json: { success: true, processed: 2 } });
      });
    };

    // Dismiss: nothing is confirmed.
    await stub(page);
    await page.goto('/dashboard');
    const prompt = page.getByRole('dialog', { name: 'Recurring expenses due' });
    await expect(prompt).toBeVisible({ timeout: 15_000 });
    await expect(prompt.getByText('2 recurring expenses are due')).toBeVisible();
    await prompt.getByRole('button', { name: 'Dismiss' }).click();
    await expect(prompt).toHaveCount(0);
    expect(confirms).toHaveLength(0);

    // A new tab is a new session: the prompt returns and "Confirm all selected" sends both months.
    const ctx = await browser.newContext({ baseURL: env.BASE_URL, storageState: 'e2e/auth/primary.json' });
    const second = await ctx.newPage();
    await stub(second);
    await second.goto('/dashboard');
    const prompt2 = second.getByRole('dialog', { name: 'Recurring expenses due' });
    await expect(prompt2).toBeVisible({ timeout: 15_000 });
    await prompt2.getByRole('button', { name: 'Confirm all selected' }).click();
    await expect(prompt2).toHaveCount(0, { timeout: 15_000 });
    expect(confirms).toHaveLength(1);
    expect(confirms[0].items.map((i: any) => i.date_iso)).toEqual(['2026-10-01', '2026-11-01']);
    await ctx.close();
  });
});
