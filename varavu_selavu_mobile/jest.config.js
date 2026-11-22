module.exports = {
  preset: 'jest-expo',
  // CI runners are slower than a laptop; a screen test's first render pays the module-load cost and
  // overran the 5s default (AddExpenseScreen.recovery.test.tsx).
  testTimeout: 20000,
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)'
  ]
};
