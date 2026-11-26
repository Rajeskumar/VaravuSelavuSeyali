import { analytics, configureAnalytics } from '../../../core/analytics';
import { createRecordingProvider } from '../../../core/analytics/providers/recording';
import { eventInvariant, terminalFamily, trackSpenseEvents } from './events';
import { resetDeepLinkDedupe, trackDeepLink } from './links';

let provider: ReturnType<typeof createRecordingProvider>;
const sent = () => provider.calls.filter((c) => c.type === 'event').map((c) => (c as { params: Record<string, string> }).params.link_type);
beforeEach(() => {
  resetDeepLinkDedupe();
  provider = createRecordingProvider();
  configureAnalytics({ provider, events: trackSpenseEvents as never, platform: 'android', product: 'trackspense', terminalFamily, invariant: eventInvariant });
  analytics.setConsent(true);
});

test('classifies invite and group links by type only', () => {
  trackDeepLink('/join/SECRET-INVITE-TOKEN?ref=abc');
  trackDeepLink('groups/7f3a1c-uuid', () => 10_000);
  expect(sent()).toEqual(['group_invite', 'group']);
  expect(JSON.stringify(provider.calls)).not.toMatch(/SECRET|7f3a1c|ref=/);
});
test('re-parsing one URL within two seconds counts once; a later open counts again', () => {
  trackDeepLink('join/t', () => 1000);
  trackDeepLink('join/t', () => 1500);
  trackDeepLink('join/t', () => 3500);
  expect(sent()).toEqual(['group_invite', 'group_invite']);
});
test('unknown, empty and malformed paths report nothing', () => {
  for (const p of ['', '/', 'settings', 'joinx/abc', 'evil/join/abc', undefined as unknown as string, 42 as unknown as string]) trackDeepLink(p);
  expect(sent()).toEqual([]);
});
test('without consent nothing is sent', () => {
  analytics.setConsent(false);
  trackDeepLink('join/t');
  expect(sent()).toEqual([]);
});
