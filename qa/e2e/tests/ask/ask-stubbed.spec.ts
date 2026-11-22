import { test, expect } from '../../fixtures/auth.fixture';
import { dismissCookieConsent } from '../../helpers/responsive.helper';

// Backlog B-15 (UAT-ASK-001..004). AI is off in QA, so the usage and chat endpoints are stubbed in
// the browser: no provider is ever called, and nothing here touches the real quota.
const usage = (over: Record<string, unknown> = {}, remaining: number | null = 5) => ({
  features: {
    chat: { used: remaining === null ? 0 : 10 - remaining, limit: remaining === null ? null : 10, remaining },
    receipt: { used: 0, limit: 5, remaining: 5 },
    categorize: { used: 0, limit: 50, remaining: 50 },
  },
  resets_at: new Date(Date.now() + 3_600_000).toISOString(),
  ai_enabled: true, paused: false, blocked: false, email_verified: true, requires_verified_email: false,
  ...over,
});

test.describe('Ask (UI, stubbed AI) @regression', () => {
  test.beforeEach(async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) <= 700, 'desktop layout');
  });

  async function openAsk(page: any, usageBody: any, chat?: (route: any) => Promise<void>) {
    await page.route('**/api/v1/ai/usage', (route: any) => route.fulfill({ json: usageBody }));
    let chatCalls = 0;
    await page.route('**/api/v1/analysis/chat', async (route: any) => {
      chatCalls += 1;
      if (chat) await chat(route);
      else await route.fulfill({ json: { response: 'Your top category is Groceries.' } });
    });
    await page.goto('/ask');
    await dismissCookieConsent(page);
    return () => chatCalls;
  }

  const input = (page: any) => page.getByRole('textbox', { name: 'Ask about your spending' });

  test('declining the AI consent sends nothing to the provider', async ({ page }) => {
    const calls = await openAsk(page, usage());
    await input(page).fill('top spending categories');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByText(/Ask needs AI features/)).toBeVisible();
    expect(calls()).toBe(0);
  });

  test('allowing AI gets an answer', async ({ page }) => {
    const calls = await openAsk(page, usage());
    await input(page).fill('top spending categories');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Allow AI features' }).click();
    await expect(page.getByText('Your top category is Groceries.')).toBeVisible({ timeout: 15_000 });
    expect(calls()).toBe(1);
  });

  test('a daily-limit answer from the server is shown in plain words', async ({ page }) => {
    await openAsk(page, usage(), (route) => route.fulfill({
      status: 429,
      json: { detail: { code: 'ai_quota_exceeded', message: 'limit', feature: 'chat', limit: 10, used: 10, resets_at: new Date(Date.now() + 3_600_000).toISOString() } },
    }));
    await input(page).fill('anything');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Allow AI features' }).click().catch(() => undefined);
    await expect(page.getByText(/You've used all 10 AI questions for today/)).toBeVisible({ timeout: 15_000 });
  });

  test('with no questions left the box says so and cannot send', async ({ page }) => {
    await openAsk(page, usage({}, 0));
    await expect(page.getByText(/Daily limit reached/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  test('with AI switched off the page says so', async ({ page }) => {
    await openAsk(page, usage({ ai_enabled: false }));
    await expect(page.getByText('AI features are turned off right now.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });
});
