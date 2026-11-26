import { analytics, configureAnalytics } from '../../../core/analytics';
import { createRecordingProvider } from '../../../core/analytics/providers/recording';
import { eventInvariant, terminalFamily, trackSpenseEvents } from './events';
import { reportPermission, resetReportedPermissions } from './permissions';

let provider: ReturnType<typeof createRecordingProvider>;
const sent = () => provider.calls.filter((c) => c.type === 'event').map((c) => (c as { params: Record<string, string> }).params)
  .map(({ permission, result }) => ({ permission, result }));
beforeEach(() => {
  resetReportedPermissions();
  provider = createRecordingProvider();
  configureAnalytics({ provider, events: trackSpenseEvents as never, platform: 'ios', product: 'trackspense', terminalFamily, invariant: eventInvariant });
  analytics.setConsent(true);
});

test('maps granted, denied and limited, once per outcome', () => {
  reportPermission('camera', { granted: true });
  reportPermission('camera', { granted: true });
  reportPermission('photos', { granted: true, accessPrivileges: 'limited' });
  reportPermission('photos', { granted: false });
  expect(sent()).toEqual([
    { permission: 'camera', result: 'granted' },
    { permission: 'photos', result: 'limited' },
    { permission: 'photos', result: 'denied' },
  ]);
});
test('a malformed response is a denial and never throws', () => {
  expect(() => reportPermission('notifications', undefined)).not.toThrow();
  expect(() => reportPermission('camera', null)).not.toThrow();
  expect(sent()).toEqual([{ permission: 'notifications', result: 'denied' }, { permission: 'camera', result: 'denied' }]);
});
test('before consent nothing is sent, and the outcome is reported later if asked again after opt-in', () => {
  analytics.setConsent(false);
  reportPermission('camera', { granted: true });
  expect(sent()).toEqual([]);
  analytics.setConsent(true);
  reportPermission('camera', { granted: true });
  expect(sent()).toEqual([{ permission: 'camera', result: 'granted' }]);
});
