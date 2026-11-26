import { analytics, configureAnalytics } from '../core/analytics';
import { createRecordingProvider } from '../core/analytics/providers/recording';
import { eventInvariant, terminalFamily, trackSpenseEvents } from '../features/shared/analytics/events';
import { resetDeepLinkDedupe } from '../features/shared/analytics/links';
import { linking } from './linking';

let provider: ReturnType<typeof createRecordingProvider>;
beforeEach(() => {
  resetDeepLinkDedupe();
  provider = createRecordingProvider();
  configureAnalytics({ provider, events: trackSpenseEvents as never, platform: 'ios', product: 'trackspense', terminalFamily, invariant: eventInvariant });
  analytics.setConsent(true);
});
const types = () => provider.calls.filter((c) => c.type === 'event').map((c) => (c as { params: Record<string, string> }).params.link_type);

test('the real linking config still resolves routes and reports the link type only', () => {
  const invite = linking.getStateFromPath('join/SECRET-INVITE-TOKEN', linking.config as never);
  expect(JSON.stringify(invite)).toContain('JoinGroup');
  const group = linking.getStateFromPath('groups/7f3a1c-uuid', linking.config as never);
  expect(JSON.stringify(group)).toContain('GroupDetail');
  expect(types()).toEqual(['group_invite', 'group']);
  expect(JSON.stringify(provider.calls)).not.toMatch(/SECRET|7f3a1c/);
});
test('an unknown link resolves as before and reports nothing', () => {
  linking.getStateFromPath('totally/unknown', linking.config as never);
  expect(types()).toEqual([]);
});
