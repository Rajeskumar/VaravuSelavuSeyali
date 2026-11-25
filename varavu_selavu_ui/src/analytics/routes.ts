/** Mirrors App.tsx's actual routes. Never build telemetry URLs from location.href. */
const define = (id: string, template: string, title: string, auth = false, excluded = false, redirect = false) =>
  ({ id, template, title: `${title} — TrackSpense`, auth, excluded, redirect });
export type AnalyticsRoute = ReturnType<typeof define>;
const literal: Record<string, AnalyticsRoute> = {
  '/': define('home', '/', 'Track less. Understand more.'),
  '/login': define('login', '/login', 'Log in'),
  '/register': define('register', '/register', 'Create account'),
  '/forgot-password': define('forgot_password', '/forgot-password', 'Forgot password'),
  '/reset-password': define('reset_password', '/reset-password', 'Reset password', false, true),
  '/verify-email': define('verify_email', '/verify-email', 'Verify email', false, true),
  '/contact': define('contact', '/contact', 'Help & support'),
  '/dashboard': define('dashboard', '/dashboard', 'Dashboard', true),
  '/expenses': define('expenses', '/expenses', 'Expenses', true),
  '/groups': define('groups', '/groups', 'Groups', true),
  '/analysis': define('analysis', '/analysis', 'Analysis', true),
  '/ask': define('ask', '/ask', 'Ask', true),
  '/account': define('account', '/account', 'Account', true),
  '/account/assistants': define('assistants', '/account/assistants', 'Connected assistants', true, true),
  '/ai/reauth': define('reauth', '/ai/reauth', 'Sign in again', false, true),
};
const redirects: Record<string, string> = {
  '/recurring': '/expenses', '/ai-analyst': '/ask', '/item-insights': '/analysis',
  '/merchant-insights': '/analysis', '/profile': '/account',
};
const missing = define('not_found', '/not-found', 'Page not found');
export function routeForPath(input: string): AnalyticsRoute {
  try {
    const path = decodeURIComponent(input.split(/[?#]/)[0]).replace(/\/+$/, '').toLowerCase() || '/';
    if (Object.prototype.hasOwnProperty.call(literal, path)) return literal[path];
    if (Object.prototype.hasOwnProperty.call(redirects, path)) return { ...literal[redirects[path]], redirect: true };
    if (/^\/groups\/join(?:\/|$)/.test(path)) return define('group_join', '/groups/join/:token', 'Join group', false, true);
    if (/^\/ai(?:\/|$)/.test(path)) {
      if (/^\/ai\/connect\//.test(path)) return define('assistant_connect', '/ai/connect/:id', 'Connect an assistant', true, true);
      if (/^\/ai\/approve\//.test(path)) return define('assistant_approve', '/ai/approve/:id', 'Review expense', true, true);
      return { ...missing, excluded: true };
    }
    if (/^\/groups\/[^/]+$/.test(path)) return define('group_detail', '/groups/:groupId', 'Groups', true);
    return missing;
  } catch { return { ...missing, excluded: true }; }
}
export function isTrackable(route: AnalyticsRoute, authenticated: boolean): boolean {
  return !route.excluded && !route.redirect && !(route.auth && !authenticated)
    && !(authenticated && ['home', 'login', 'register'].includes(route.id));
}
export function safeReferrer(raw: string, origin: string): string {
  try {
    const url = new URL(raw);
    if (url.username || url.password) return '';
    if (url.origin === origin) {
      const route = routeForPath(url.pathname);
      return route.excluded || route.redirect || route.id === 'not_found' ? '' : origin + route.template;
    }
    // Acquisition detail beyond this exact origin needs a reviewed allowlist change.
    return url.origin === 'https://cerebroos.com' ? 'https://cerebroos.com/' : '';
  } catch { return ''; }
}
