// Deep-link configuration for invite URLs: trackspense://join/{token}
import { getStateFromPath } from '@react-navigation/native';
import { trackDeepLink } from '../features/shared/analytics/links';

export const linking = {
  prefixes: ['trackspense://', 'https://trackspense.app'],
  // Reports only the kind of link (invite or group); the path, token and ids are never sent.
  getStateFromPath: ((path: string, options: Parameters<typeof getStateFromPath>[1]) => {
    trackDeepLink(path);
    return getStateFromPath(path, options);
  }) as typeof getStateFromPath,
  config: {
    screens: {
      JoinGroup: 'join/:token',
      Groups: 'groups',
      GroupDetail: 'groups/:groupId',
    },
  },
};
