import { analytics, configureAnalytics } from '../core/analytics';
import { createRecordingProvider } from '../core/analytics/providers/recording';
import { eventInvariant, terminalFamily, trackSpenseEvents } from '../features/shared/analytics/events';
import { onNotificationResponse } from './notificationResponse';

let provider: ReturnType<typeof createRecordingProvider>;
beforeEach(() => {
  provider = createRecordingProvider();
  configureAnalytics({ provider, events: trackSpenseEvents as never, platform: 'ios', product: 'trackspense', terminalFamily, invariant: eventInvariant });
  analytics.setConsent(true);
});
const events = () => provider.calls.filter((c) => c.type === 'event') as { name: string; params: Record<string, string> }[];

test('a group notification navigates and reports only its type', () => {
  const navigate = jest.fn();
  onNotificationResponse({ group_id: 'SECRET-GROUP-ID' }, { navigate });
  expect(navigate).toHaveBeenCalledWith('GroupDetail', { groupId: 'SECRET-GROUP-ID' });
  expect(events().map((e) => e.name)).toEqual(['notification_opened']);
  expect(events()[0].params.notification_type).toBe('group_activity');
  expect(JSON.stringify(provider.calls)).not.toMatch(/SECRET/);
});
test('a notification with no group does nothing and reports nothing', () => {
  const navigate = jest.fn();
  onNotificationResponse({ unrelated: 1 }, { navigate });
  onNotificationResponse(undefined, { navigate });
  expect(navigate).not.toHaveBeenCalled();
  expect(events()).toEqual([]);
});
