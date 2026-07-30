import { Page, expect } from '@playwright/test';

export const MIN_TOUCH_TARGET = 44;

/** Where auth.setup.ts stores the logged-in cookie jar for reuse. */
export const AUTH_STATE_PATH = 'e2e/.auth/user.json';

/** Screens covered by the responsive suite. */
export const PRIMARY_ROUTES = ['/dashboard', '/expenses', '/analysis', '/groups'] as const;

/**
 * Logs in through the real form so the HttpOnly auth cookies are set the way
 * they are in production. There is no token to inject into localStorage.
 */
export async function login(page: Page): Promise<void> {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error('Set E2E_EMAIL and E2E_PASSWORD (see e2e/README.md).');
  }

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  // The header also carries a "Login" button, so target the form's submit.
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

/** True horizontal page overflow: the acceptance criterion from the brief. */
export async function expectNoHorizontalScroll(page: Page, label: string): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `${label}: page scrolls horizontally`).toBeLessThanOrEqual(innerWidth);
}

/**
 * Elements extending past the viewport that are NOT clipped or scrollable by an
 * ancestor. Decorative absolutely-positioned background blobs sit inside an
 * `overflow-x: hidden` parent and are excluded deliberately, as is wide content
 * that legitimately scrolls inside its own container.
 */
export async function findBleedingElements(page: Page): Promise<Array<{ tag: string; text: string; right: number }>> {
  return page.evaluate(() => {
    const clipped = (el: Element) => {
      let a = el.parentElement;
      while (a) {
        const ov = getComputedStyle(a).overflowX;
        if (ov === 'hidden' || ov === 'clip' || ov === 'auto' || ov === 'scroll') return true;
        a = a.parentElement;
      }
      return false;
    };
    const out: Array<{ tag: string; text: string; right: number }> = [];
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > window.innerWidth + 1 && !clipped(el)) {
        out.push({ tag: el.tagName, text: (el.textContent || '').trim().slice(0, 40), right: Math.round(r.right) });
      }
    });
    return out;
  });
}

/**
 * Controls whose *effective* tap area is under the minimum.
 *
 * Measured by hit-testing outward from the centre rather than reading the box:
 * SegmentedTabs keeps a visually compact 22-32px pill but expands its tappable
 * region to 44x44 with an invisible `::after`, and that legitimately passes.
 */
export async function findSmallTouchTargets(
  page: Page,
  min = MIN_TOUCH_TARGET,
): Promise<Array<{ label: string; box: string; effective: string }>> {
  return page.evaluate((minSize) => {
    const owns = (target: Element, x: number, y: number) => {
      const el = document.elementFromPoint(x, y);
      return !!el && (el === target || target.contains(el) || el.contains(target));
    };
    const effective = (target: Element) => {
      const r = target.getBoundingClientRect();
      const cx = Math.round(r.left + r.width / 2);
      const cy = Math.round(r.top + r.height / 2);
      if (!owns(target, cx, cy)) return null; // obscured or offscreen: not measurable
      let up = 0, down = 0, left = 0, right = 0;
      const limit = minSize;
      while (up < limit && owns(target, cx, cy - up - 1)) up++;
      while (down < limit && owns(target, cx, cy + down + 1)) down++;
      while (left < limit && owns(target, cx - left - 1, cy)) left++;
      while (right < limit && owns(target, cx + right + 1, cy)) right++;
      return { h: up + down + 1, w: left + right + 1 };
    };

    const out: Array<{ label: string; box: string; effective: string }> = [];
    document.querySelectorAll('button,a[href],[role="button"],select,textarea,.MuiInputBase-root').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return; // hidden
      if (r.height >= minSize && r.width >= minSize) return; // passes on box alone
      const eff = effective(el);
      if (!eff) return;
      if (eff.h < minSize || eff.w < minSize) {
        out.push({
          label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40),
          box: `${Math.round(r.height)}x${Math.round(r.width)}`,
          effective: `${eff.h}x${eff.w}`,
        });
      }
    });
    return out;
  }, min);
}

/** Elements using ellipsis truncation, which must not push layout wider. */
export async function findOverflowingTruncatedText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('*').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.textOverflow !== 'ellipsis') return;
      // A truncating element must be constrained, not sized by its content.
      if (el.scrollWidth > el.clientWidth + 1 && el.getBoundingClientRect().right > window.innerWidth + 1) {
        out.push((el.textContent || '').trim().slice(0, 40));
      }
    });
    return out;
  });
}
