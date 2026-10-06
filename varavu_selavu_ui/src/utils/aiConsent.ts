/**
 * Consent to send questions and receipt images to a third-party AI provider.
 *
 * Asked once per signed-in user, the first time they use something that sends data out (Ask, Scan
 * receipt). Stored on this device per account; declining keeps the rest of the app fully usable.
 * `ensureAiConsent()` resolves true immediately when already granted, otherwise raises the
 * dialog mounted in <AiConsentHost /> and resolves with the person's choice.
 */
const EVENT = 'vs:ai-consent-request';
const KEY_PREFIX = 'vs_ai_consent_v1:';

function key(): string {
  try {
    return KEY_PREFIX + (localStorage.getItem('vs_user') || '');
  } catch {
    return KEY_PREFIX;
  }
}

export function hasAiConsent(): boolean {
  try {
    return localStorage.getItem(key()) === 'granted';
  } catch {
    return false;
  }
}

export function recordAiConsent(granted: boolean): void {
  try {
    if (granted) localStorage.setItem(key(), 'granted');
    else localStorage.removeItem(key());
  } catch {
    /* storage unavailable: the choice applies to this session only */
  }
}

export function ensureAiConsent(): Promise<boolean> {
  if (hasAiConsent()) return Promise.resolve(true);
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { resolve } }));
  });
}

export function onAiConsentRequest(handler: (resolve: (granted: boolean) => void) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent).detail.resolve);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
