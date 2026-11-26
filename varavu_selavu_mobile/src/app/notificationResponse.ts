import { extractGroupIdFromNotificationData } from '../features/groups/utils/notificationLink';
import { track } from '../features/shared/analytics/operations';

/** Tapping a push notification (TS-GRP-110) deep-links straight to the group it's about. */
export function onNotificationResponse(data: Record<string, unknown> | undefined, navigation: { navigate: (...args: any[]) => void }) {
  const groupId = extractGroupIdFromNotificationData(data);
  if (groupId) {
    track('notification_opened', { notification_type: 'group_activity' }); // type only; never the group id
    navigation.navigate('GroupDetail', { groupId });
  }
}
