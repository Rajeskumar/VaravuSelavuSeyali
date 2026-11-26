import React from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary } from 'react-error-boundary';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from '@expo-google-fonts/instrument-sans';
import { AuthProvider } from '../auth/AuthContext';
import SessionQueryProvider from '../auth/SessionQueryProvider';
import { ThemeProvider, useAppTheme } from '../theme/ThemeContext';
import { bootScreen, darkTheme } from '../theme/theme';
import { fontMap } from '../theme/fonts';
import { setAppConfig } from '../config/appConfig';
import AnalyticsLifecycle from '../analytics/AnalyticsLifecycle';
import { crashReporter } from '../analytics';
import RootNavigator from './RootNavigator';
import { CoreAppProps } from './types';

function ErrorFallback({ error }: any) {
  return (
    <SafeAreaView style={errorStyles.errorContainer}>
      <Text style={errorStyles.errorTitle}>Something went wrong</Text>
      <Text style={errorStyles.errorText}>{error.message}</Text>
    </SafeAreaView>
  );
}

// Renders the status bar with the correct contrast for the active theme.
function ThemedStatusBarAndNav(props: CoreAppProps) {
  const { isDark } = useAppTheme();
  return (
    <>
      {/* SDK 57 is edge-to-edge only: the status bar is always transparent, so the old
          backgroundColor/translucent props no longer exist. */}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator {...props} />
    </>
  );
}

/**
 * The reusable app root: error boundary, safe area, theme, auth, the per-session data client, status bar and
 * the navigator. Everything product-specific arrives through props (see CoreAppProps).
 */
export default function CoreApp(props: CoreAppProps) {
  // Core reads the config lazily; it must be registered before anything below renders.
  setAppConfig(props.config);
  const [fontsLoaded] = useFonts(fontMap);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: bootScreen.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={bootScreen.spinner} />
      </View>
    );
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} onError={(error) => crashReporter.recordError(error)}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            {/* One data client per signed-in session; replaced on explicit and forced sign-out. */}
            <SessionQueryProvider>
              <AnalyticsLifecycle />
              <ThemedStatusBarAndNav {...props} />
            </SessionQueryProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

// Outside ThemeProvider (ErrorBoundary wraps it), so this can't read useAppTheme() — it uses the
// static dark palette directly rather than a light fallback, which would flash a jarring white
// screen on top of an otherwise all-dark app.
const errorStyles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: darkTheme.colors.background,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: darkTheme.colors.error,
  },
  errorText: {
    fontSize: 14,
    color: darkTheme.colors.textSecondary,
    textAlign: 'center',
  },
});
