const { withEntitlementsPlist } = require('@expo/config-plugins');

/**
 * Strips the iOS push entitlement so the app builds with a free personal Apple ID (which can't
 * sign push-capable apps). Release builds must keep it, or group notifications never arrive on
 * iOS: set TRACKSPENSE_ENABLE_PUSH=1 when building (e.g. in an eas.json build profile's `env`).
 */
module.exports = function withDisablePush(config) {
  if (process.env.TRACKSPENSE_ENABLE_PUSH === '1') return config;
  return withEntitlementsPlist(config, async (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
