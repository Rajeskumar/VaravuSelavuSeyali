const { withEntitlementsPlist } = require('@expo/config-plugins');

module.exports = function withDisablePush(config) {
  return withEntitlementsPlist(config, async (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
