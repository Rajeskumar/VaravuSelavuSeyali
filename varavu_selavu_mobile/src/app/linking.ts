// Deep-link configuration for invite URLs: trackspense://join/{token}
export const linking = {
  prefixes: ['trackspense://', 'https://trackspense.app'],
  config: {
    screens: {
      JoinGroup: 'join/:token',
      Groups: 'groups',
      GroupDetail: 'groups/:groupId',
    },
  },
};
