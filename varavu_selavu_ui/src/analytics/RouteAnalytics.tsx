import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { analytics, finishInviteOutcome } from './browser';
import { routeForPath } from './routes';

export default function RouteAnalytics() {
  const { pathname } = useLocation();
  useEffect(() => {
    // Ignore stale render effects during redirects; StrictMode replay is deduped by client.
    if (window.location.pathname !== pathname) return;
    let authenticated = false;
    try { authenticated = !!localStorage.getItem('vs_user'); } catch { /* fail closed */ }
    document.title = routeForPath(pathname).title;
    analytics.trackPageView(pathname, authenticated);
    finishInviteOutcome(pathname);
  }, [pathname]);
  return null;
}
