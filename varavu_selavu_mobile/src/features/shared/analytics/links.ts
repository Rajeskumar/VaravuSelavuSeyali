import { track } from './operations';

let last: { type: string; at: number } | null = null;

/**
 * Classifies an incoming deep-link PATH into a fixed link type. The path (which carries invite tokens and
 * group ids) is read here and discarded; only the type is reported. A link counts once, and a repeat of
 * the same type within two seconds (React Navigation re-parsing one URL) is ignored.
 */
export function trackDeepLink(path: string | undefined, now: () => number = Date.now): void {
  try {
    const clean = String(path ?? '').split(/[?#]/)[0].replace(/^\/+/, '');
    const type = /^join\//.test(clean) ? 'group_invite' : /^groups(\/|$)/.test(clean) ? 'group' : null;
    if (!type) return;
    const time = now();
    if (last && last.type === type && time - last.at < 2000) return;
    last = { type, at: time };
    track('deep_link_opened', { link_type: type });
  } catch { /* never affects navigation */ }
}
export function resetDeepLinkDedupe(): void { last = null; }
