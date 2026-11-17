import { extractGroupIdFromNotificationData } from './notificationLink';

describe('extractGroupIdFromNotificationData', () => {
  test('reads group_id directly when present', () => {
    expect(extractGroupIdFromNotificationData({ group_id: 'g-123' })).toBe('g-123');
  });

  test('falls back to parsing deep_link when group_id is absent', () => {
    expect(
      extractGroupIdFromNotificationData({ deep_link: 'trackspense://groups/g-456' }),
    ).toBe('g-456');
  });

  test('returns null for undefined data', () => {
    expect(extractGroupIdFromNotificationData(undefined)).toBeNull();
  });

  test('returns null when neither field yields a group id', () => {
    expect(extractGroupIdFromNotificationData({ some_other_field: 'x' })).toBeNull();
  });
});
