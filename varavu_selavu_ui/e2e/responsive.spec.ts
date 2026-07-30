import { test, expect } from '@playwright/test';
import {
  MIN_TOUCH_TARGET,
  PRIMARY_ROUTES,
  findBleedingElements,
  findOverflowingTruncatedText,
  findSmallTouchTargets,
  expectNoHorizontalScroll,
} from './helpers';

/** P1-4: real small-viewport rendering, which the audit could not verify. */
test.describe('mobile rendering', () => {

  for (const route of PRIMARY_ROUTES) {
    test(`${route} has no horizontal overflow`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      await expectNoHorizontalScroll(page, route);

      const bleeding = await findBleedingElements(page);
      expect(bleeding, `${route}: unclipped elements past the viewport`).toEqual([]);
    });

    test(`${route} has no touch target under ${MIN_TOUCH_TARGET}px`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const small = await findSmallTouchTargets(page);
      expect(small, `${route}: controls below the touch-target minimum`).toEqual([]);
    });

    test(`${route} keeps truncated names inside the viewport`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const pushing = await findOverflowingTruncatedText(page);
      expect(pushing, `${route}: ellipsised text widened the layout`).toEqual([]);
    });
  }

  test('the sidebar collapses to a bottom nav with reachable destinations', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // MUI leaves the docked drawer in the DOM and hides it, so assert it takes
    // no space rather than that it is absent.
    await expect(page.locator('.MuiDrawer-docked')).toBeHidden();

    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav).toBeVisible();

    for (const name of ['Dashboard', 'Expenses', 'Analysis', 'Groups']) {
      await expect(nav.getByRole('link', { name, exact: false })).toBeVisible();
    }
  });

  test('the quick-capture sheet fits the viewport', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /add expense/i }).first().click();
    await expect(page.getByPlaceholder('Description')).toBeVisible();

    await expectNoHorizontalScroll(page, 'quick-capture sheet');
    expect(await findBleedingElements(page), 'quick-capture sheet bleeds').toEqual([]);
  });
});

/** P1-3's client-side half: the amount field cannot be driven out of range. */
test.describe('amount entry bounds', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /add expense/i }).first().click();
    await expect(page.getByPlaceholder('Description')).toBeVisible();
  });

  const amountDisplay = (page: import('@playwright/test').Page) =>
    page.locator('text=/^\\$[0-9]/').first();

  test('the keypad cannot exceed the maximum amount', async ({ page }) => {
    // Far more presses than the ceiling allows; the field must simply stop.
    for (let i = 0; i < 12; i++) {
      await page.locator('div', { hasText: /^9$/ }).last().click();
    }

    const shown = (await amountDisplay(page).textContent()) ?? '';
    const value = Number(shown.replace(/[^0-9.]/g, ''));
    expect(value, 'keypad composed an amount above the server ceiling').toBeLessThanOrEqual(1_000_000);
  });

  test('the amount display never overflows its sheet at maximum digits', async ({ page }) => {
    for (let i = 0; i < 12; i++) {
      await page.locator('div', { hasText: /^9$/ }).last().click();
    }

    const fits = await page.evaluate(() => {
      // Scope to the sheet: the dashboard hero behind it also renders a "$…" figure.
      const sheet = document.querySelector('input[placeholder="Description"]')?.closest('.MuiPaper-root');
      if (!sheet) return { error: 'sheet not found' };
      const amt = [...sheet.querySelectorAll('*')].find(
        (e) => e.children.length === 0 && /^\$[0-9]/.test((e.textContent || '').trim()),
      );
      if (!amt) return { error: 'amount display not found in sheet' };
      const a = amt.getBoundingClientRect();
      const s = sheet.getBoundingClientRect();
      return { text: amt.textContent!.trim(), fits: a.left >= s.left - 1 && a.right <= s.right + 1 };
    });

    expect(fits, 'amount text escaped the sheet').toMatchObject({ fits: true });
    await expectNoHorizontalScroll(page, 'amount at max digits');
  });

  test('save stays disabled at a zero amount', async ({ page }) => {
    await page.getByPlaceholder('Description').fill('Playwright zero-amount check');
    await expect(page.getByRole('button', { name: /^save$/i })).toBeDisabled();
  });
});

/** P0-1: no JWT may be reachable from page JavaScript. */
test.describe('token storage', () => {
  test('no JWT is readable from localStorage, sessionStorage or document.cookie', async ({ page }) => {
    await page.goto('/dashboard');

    const exposed = await page.evaluate(() => {
      const looksLikeJwt = (v: string | null) => !!v && /^eyJ[\w-]+\.[\w-]+\./.test(v);
      const scan = (store: Storage) =>
        Object.keys(store).filter((k) => looksLikeJwt(store.getItem(k)));
      return {
        localStorage: scan(window.localStorage),
        sessionStorage: scan(window.sessionStorage),
        cookieJwts: document.cookie.split(';').map((c) => c.split('=').slice(1).join('=').trim()).filter(looksLikeJwt),
        localStorageKeys: Object.keys(window.localStorage),
      };
    });

    expect(exposed.localStorage, 'JWT found in localStorage').toEqual([]);
    expect(exposed.sessionStorage, 'JWT found in sessionStorage').toEqual([]);
    expect(exposed.cookieJwts, 'JWT readable via document.cookie — cookie is not HttpOnly').toEqual([]);
    // The display identity may remain; it is not a credential.
    expect(exposed.localStorageKeys).not.toContain('vs_token');
    expect(exposed.localStorageKeys).not.toContain('vs_refresh');
  });

  test('authenticated requests succeed on cookies alone', async ({ page }) => {
    await page.goto('/expenses');
    await page.waitForLoadState('networkidle');

    const status = await page.evaluate(async () => {
      const base = (window as any).__API_BASE__ || 'http://localhost:8080';
      const res = await fetch(`${base}/api/v1/auth/me`, { credentials: 'include' });
      return res.status;
    });
    expect(status).toBe(200);
  });

  test('logged-out navigation to /dashboard redirects to /login', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => window.localStorage.clear());
    await page.context().clearCookies();

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
