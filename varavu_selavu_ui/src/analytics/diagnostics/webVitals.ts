/**
 * Post-consent Web Vitals observer (LCP, INP, CLS) for web diagnostics (TS-OBS-001 AC-09).
 * Never buffers or sends pre-consent observations.
 */

import { isDiagnosticsConsented, subscribeDiagnosticsConsent } from './consent';
import { WebDiagnosticsClient, webDiagnostics } from './client';

let started = false;

export function startWebVitalsDiagnostics(client: WebDiagnosticsClient = webDiagnostics): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  const attachIfConsented = () => {
    if (!isDiagnosticsConsented()) return;
    import('web-vitals')
      .then((wv: Record<string, unknown>) => {
        const lcpFn = (wv.onLCP || wv.getLCP) as
          | ((cb: (m: { value: number }) => void) => void)
          | undefined;
        const inpFn = (wv.onINP || wv.getINP) as
          | ((cb: (m: { value: number }) => void) => void)
          | undefined;
        const clsFn = (wv.onCLS || wv.getCLS) as
          | ((cb: (m: { value: number }) => void) => void)
          | undefined;

        lcpFn?.((m) => {
          if (isDiagnosticsConsented()) client.recordWebVital('lcp', m.value);
        });
        inpFn?.((m) => {
          if (isDiagnosticsConsented()) client.recordWebVital('inp', m.value);
        });
        clsFn?.((m) => {
          if (isDiagnosticsConsented()) client.recordWebVital('cls', m.value);
        });
      })
      .catch(() => {
        // Never break rendering if web-vitals chunk cannot load.
      });
  };

  if (isDiagnosticsConsented()) {
    attachIfConsented();
  } else {
    const unsub = subscribeDiagnosticsConsent((choice) => {
      if (choice === 'granted') {
        unsub();
        attachIfConsented();
      }
    });
  }
}
