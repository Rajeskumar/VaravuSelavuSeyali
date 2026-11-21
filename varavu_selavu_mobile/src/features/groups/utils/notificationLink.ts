/** Notification-tap helpers for groups (TS-GRP-110). */
/**
 * Extracts the group_id from a notification's data payload (deep_link:
 * "trackspense://groups/{id}", set server-side by NotificationService.fan_out)
 * so the notification-tap handler can navigate directly, without relying on
 * OS-level URL routing (see app/App.tsx).
 */
export function extractGroupIdFromNotificationData(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  if (typeof data.group_id === 'string' && data.group_id) return data.group_id;
  const deepLink = data.deep_link;
  if (typeof deepLink === 'string') {
    const match = deepLink.match(/groups\/([^?#/]+)/);
    if (match) return match[1];
  }
  return null;
}
