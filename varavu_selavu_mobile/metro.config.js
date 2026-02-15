const { getDefaultConfig } = require('expo/metro-config');

// Only call getDefaultConfig if necessary
let config = {};

try {
  config = getDefaultConfig (__dirname);
} catch (e) {
  // If getDefaultConfig fails, use minimal config
  config = {
    project: {
      ios: {},
      android: {},
    },
    transformer: {
      getTransformOptions: async () => ({
        transform: {
          experimentalImportSupport: false,
          inlineRequires: true,
        },
      }),
    },
  };
}

module.exports = config;

