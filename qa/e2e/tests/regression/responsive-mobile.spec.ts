import { test, expect } from '../../fixtures/auth.fixture';
import {
  MIN_TOUCH_TARGET,
  MOBILE_VIEWPORT_MAX_WIDTH,
  PRIMARY_ROUTES,
  findBleedingElements,
  findOverflowingTruncatedText,
  findSmallTouchTargets,
  expectNoHorizontalScroll,
  dismissCookieConsent,
} from '../../helpers/responsive.helper';
import { env } from '../../helpers/env';

/**
 * Migrated from the former `varavu_selavu_ui/e2e/responsive.spec.ts` (P1-3/P1-4 of the
 * pre-launch audit) into the unified QA framework — same assertions, same reasoning
 * (see the two "easy to get wrong" notes in the original component's doc comments,
 * now on responsive.helper.ts), running here instead of as a second parallel suite.
 *
 * Real small-viewport rendering: no horizontal overflow, no touch target under 44px,
 * no ellipsised text that widens the layout, no JWT reachable from page JavaScript,
 * and the amount field cannot be driven out of range.
 */
// Mobile-viewport-only checks (bottom-nav collapse, touch targets, keypad) are
// meaningless — and actively wrong to assert on — at desktop width, since the app's own
// responsive breakpoints intentionally render differently there (e.g. the sidebar nav does
// NOT collapse to a bottom bar on desktop; that's correct, not a bug). This file is meant
// to run under the `mobile-iphone` project, but sits in the default `e2e/tests` testDir so
// `qa:regression` picks it up too — the two viewport-dependent describe blocks below
// self-skip outside a narrow viewport rather than asserting something false. `token
// storage`'s tests further down are viewport-independent and always run.

test.describe('mobile rendering @regression', () => {
  test.beforeEach(async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) > MOBILE_VIEWPORT_MAX_WIDTH, 'mobile-viewport-only check');
  });

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

    // MUI leaves the docked drawer in the DOM and hides it, so assert it takes no space
    // rather than that it is absent.
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
    await dismissCookieConsent(page);

    await page.getByRole('button', { name: /add expense/i }).first().click();
    await expect(page.getByTestId('quick-capture-description')).toBeVisible();

    await expectNoHorizontalScroll(page, 'quick-capture sheet');
    expect(await findBleedingElements(page), 'quick-capture sheet bleeds').toEqual([]);
  });
});

test.describe('amount entry bounds @regression', () => {
  test.beforeEach(async ({ page }) => {
    // The numeric keypad these tests drive only renders on QuickCaptureSheet's mobile
    // branch (isDesktop check) — see the file-level comment above.
    test.skip((page.viewportSize()?.width ?? 0) > MOBILE_VIEWPORT_MAX_WIDTH, 'mobile-viewport-only check');
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await dismissCookieConsent(page);
    await page.getByRole('button', { name: /add expense/i }).first().click();
    await expect(page.getByTestId('quick-capture-description')).toBeVisible();
  });

  test('the keypad cannot exceed the maximum amount', async ({ page }) => {
    // Far more presses than the ceiling allows; the field must simply stop composing.
    for (let i = 0; i < 12; i++) {
      await page.getByTestId('keypad-9').click();
    }

    const shown = (await page.locator('text=/^\\$[0-9]/').first().textContent()) ?? '';
    const value = Number(shown.replace(/[^0-9.]/g, ''));
    expect(value, 'keypad composed an amount above the server ceiling').toBeLessThanOrEqual(1_000_000);
  });

  test('the amount display never overflows its sheet at maximum digits', async ({ page }) => {
    for (let i = 0; i < 12; i++) {
      await page.getByTestId('keypad-9').click();
    }

    const fits = await page.evaluate(() => {
      const sheet = document.querySelector('[data-testid="quick-capture-description"]')?.closest('.MuiPaper-root');
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
    await page.getByTestId('quick-capture-description').fill('QA_E2E_zero_amount_check');
    await expect(page.getByTestId('quick-capture-save')).toBeDisabled();
  });
});

/** No JWT may be reachable from page JavaScript — HttpOnly cookies are the whole point. */
test.describe('token storage @regression @critical', () => {
  test('no JWT is readable from localStorage, sessionStorage or document.cookie', async ({ page }) => {
    await page.goto('/dashboard');

    const exposed = await page.evaluate(() => {
      const looksLikeJwt = (v: string | null) => !!v && /^eyJ[\w-]+\.[\w-]+\./.test(v);
      const scan = (store: Storage) => Object.keys(store).filter((k) => looksLikeJwt(store.getItem(k)));
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
    expect(exposed.localStorageKeys).not.toContain('vs_token');
    expect(exposed.localStorageKeys).not.toContain('vs_refresh');
  });

  test('authenticated requests succeed on cookies alone', async ({ page }) => {
    await page.goto('/expenses');
    await page.waitForLoadState('networkidle');

    const status = await page.evaluate(async (apiBase) => {
      const res = await fetch(`${apiBase}/api/v1/auth/me`, { credentials: 'include' });
      return res.status;
    }, env.API_BASE_URL);
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
