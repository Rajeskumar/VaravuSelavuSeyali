import { AnalyticsConfig } from '../config';
import { AnalyticsProvider, PageContext } from './types';
type TagWindow = Window & { tsAnalyticsLayer?: unknown[]; tsAnalyticsTag?: (...args: unknown[]) => void; [key: string]: unknown };
const COOKIE_PREFIX = 'tsga';
/** A private queue avoids marketing/legacy globals. Disable is terminal in this document:
 * listeners in an executed third-party script cannot be removed by removing its script node. */
export function createGa4Provider(win: Window, doc: Document): AnalyticsProvider {
  const w = win as TagWindow;
  let id = '';
  let started = false;
  let debug = false;
  let stopped = false;
  let script: HTMLScriptElement | undefined;
  const call = (...args: unknown[]) => { if (!stopped) w.tsAnalyticsTag?.(...args); };
  const clearCookies = () => {
    try {
      for (const part of doc.cookie.split(';')) {
        const name = part.trim().split('=')[0];
        if (name === `${COOKIE_PREFIX}_ga` || name.startsWith(`${COOKIE_PREFIX}_ga_`)) {
          doc.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
        }
      }
    } catch { /* No other cookies, especially marketing/auth, are touched. */ }
  };
  const provider: AnalyticsProvider = {
    initialize(config: AnalyticsConfig, page: PageContext) {
      if (started || stopped || !config.enabled) return;
      id = config.measurementId;
      if (!/^G-[A-Z0-9]{6,20}$/.test(id) || id === 'G-0M1N9KSEW5') return;
      started = true;
      debug = config.debug === true;
      w[`ga-disable-${id}`] = false;
      w.tsAnalyticsLayer = [];
      w.tsAnalyticsTag = function () { w.tsAnalyticsLayer?.push(arguments); };
      call('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      // The Google tag can emit an initial view during its 'js' bootstrap, before
      // the destination config is applied. Suppress it before both commands.
      call('set', { ...page, product: 'trackspense', platform: 'web', send_page_view: false });
      call('js', new Date());
      call('config', id, { ...page, send_page_view: false, allow_google_signals: false,
        allow_ad_personalization_signals: false, cookie_prefix: COOKIE_PREFIX,
        cookie_domain: 'none', cookie_path: '/', cookie_flags: 'SameSite=Lax;Secure', ...(config.debug ? { debug_mode: true } : {}) });
      script = doc.createElement('script');
      script.id = 'ga4-script'; script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${id}&l=tsAnalyticsLayer`;
      script.onerror = () => provider.disable();
      doc.head.appendChild(script);
    },
    context(page) { if (started) call('set', { ...page }); },
    track(name, properties) {
      if (!started) return;
      const mapped = { ...properties };
      if ((name === 'login' || name === 'sign_up') && mapped.authentication_method) {
        mapped.method = mapped.authentication_method; delete mapped.authentication_method;
      }
      call('event', name, { ...mapped, send_to: id, ...(debug ? { debug_mode: true } : {}) });
    },
    disable() {
      stopped = true;
      if (id) w[`ga-disable-${id}`] = true;
      if (w.tsAnalyticsLayer) w.tsAnalyticsLayer.length = 0;
      w.tsAnalyticsTag = () => {};
      script?.remove();
    },
    resetIdentity() { provider.disable(); clearCookies(); },
  };
  return provider;
}
