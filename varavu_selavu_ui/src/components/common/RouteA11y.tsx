import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { routeForPath } from '../../analytics/routes';

export function titleForPath(pathname: string): string { return routeForPath(pathname).title; }

/** SPA route changes don't reload the page, so without this every screen shares one document
 * title and assistive tech never hears that navigation happened (WCAG 2.4.2, 4.1.3). On each
 * path change: set a per-route title, then move focus to the page's `<h1>` (falling back to the
 * main landmark) so a screen reader announces the new page and keyboard users start at its top.
 * Query-only changes (tab switches) and the initial load don't steal focus. */
const RouteA11y: React.FC = () => {
  const { pathname } = useLocation();
  const first = useRef(true);

  useEffect(() => {
    document.title = titleForPath(pathname);
    if (first.current) {
      first.current = false;
      return;
    }
    // Wait a frame so the new route's heading has mounted.
    const id = requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>('main h1') ?? document.getElementById('main-content');
      if (!target) return;
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return null;
};

export default RouteA11y;
