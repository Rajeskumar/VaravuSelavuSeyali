import { Page, expect } from '@playwright/test';

export const MIN_TOUCH_TARGET = 44;

/**
 * Viewport width threshold used to gate desktop-only vs. mobile-only interaction
 * patterns — e.g. QuickCaptureSheet's amount field is a plain `data-testid="quick-capture-amount"`
 * text input above this width and a numeric keypad (`data-testid="keypad-*"`, no such
 * text input at all) below it. Any test that assumes one of those two patterns should
 * skip itself outside the matching viewport rather than fail — see responsive-mobile.spec.ts,
 * expense-crud.spec.ts, expense-validation.spec.ts.
 */
export const MOBILE_VIEWPORT_MAX_WIDTH = 700;

/** Screens covered by the responsive/mobile-rendering regression suite. */
export const PRIMARY_ROUTES = ['/dashboard', '/expenses', '/analysis', '/groups'] as const;

/**
 * The footer-anchored cookie-consent banner (`ConsentBanner.tsx`) sits at the bottom of
 * the viewport, same as the mobile FAB — at narrow widths its Accept/Decline row can
 * physically overlap the FAB's hit area and intercept the click (`<div role="region"
 * aria-label="Cookie consent">... subtree intercepts pointer events`), caught verifying
 * this framework's mobile-viewport tests. Callers that click anything bottom-anchored at
 * mobile width should dismiss it first.
 */
export async function dismissCookieConsent(page: Page): Promise<void> {
  const decline = page.getByRole('button', { name: 'Decline' });
  if (await decline.isVisible().catch(() => false)) {
    await decline.click();
  }
}

/** True horizontal page overflow: the acceptance criterion for "no bleed on mobile". */
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
 * Controls whose *effective* tap area is under the minimum. Measured by hit-testing
 * outward from the centre rather than reading the box: SegmentedTabs keeps a visually
 * compact 22-32px pill but expands its tappable region to 44x44 with an invisible
 * `::after`, and that legitimately passes.
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
      if (el.scrollWidth > el.clientWidth + 1 && el.getBoundingClientRect().right > window.innerWidth + 1) {
        out.push((el.textContent || '').trim().slice(0, 40));
      }
    });
    return out;
  });
}
