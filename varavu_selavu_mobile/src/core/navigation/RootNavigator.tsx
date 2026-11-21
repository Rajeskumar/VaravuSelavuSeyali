import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, useNavigation, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../auth/AuthContext';
import { useAppTheme } from '../theme/ThemeContext';
import ToastProvider from '../ui/Toast';
import LoginScreen from '../auth/LoginScreen';
import RegisterScreen from '../auth/RegisterScreen';
import ForgotPasswordScreen from '../auth/ForgotPasswordScreen';
import SecurityScreen from '../auth/SecurityScreen';
import DeleteAccountScreen from '../auth/DeleteAccountScreen';
import MainTabs from './MainTabs';
import { CoreAppProps } from './types';

const Stack = createNativeStackNavigator();

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}

type ShellProps = Pick<CoreAppProps, 'tabs' | 'renderTabIcon' | 'floatingAction' | 'stackScreens' | 'onNotificationResponse'>;

function AppShell({ tabs, renderTabIcon, floatingAction, stackScreens, onNotificationResponse }: ShellProps) {
  const navigation = useNavigation<any>();
  // Stable component identity so the tab navigator isn't remounted by AppShell re-renders.
  const MainTabsScreen = React.useCallback(
    () => <MainTabs tabs={tabs} renderTabIcon={renderTabIcon} floatingAction={floatingAction} />,
    [tabs, renderTabIcon, floatingAction],
  );

  // Tapping a push notification hands its data payload to the app, whether the app was
  // foregrounded/backgrounded or launched fresh from it.
  useEffect(() => {
    if (!onNotificationResponse) return;
    const handle = (data: Record<string, unknown> | undefined) => onNotificationResponse(data, navigation);

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handle(response.notification.request.content.data as Record<string, unknown>);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handle(response.notification.request.content.data as Record<string, unknown>);
    });
    return () => subscription.remove();
  }, [navigation, onNotificationResponse]);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabsScreen} />
      {/* Pushed screens draw their own header (ScreenHeader with back) — native bar is off. */}
      {stackScreens.map((s) => <Stack.Screen key={s.name} name={s.name} component={s.component} />)}
      <Stack.Screen name="Security" component={SecurityScreen} />
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
    </Stack.Navigator>
  );
}

export default function RootNavigator(props: CoreAppProps) {
  const { accessToken, isLoading } = useAuth();
  const { theme, isDark } = useAppTheme();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const providers = props.authedProviders ?? [];
  const signedIn = providers.reduceRight(
    (children, Provider) => <Provider>{children}</Provider>,
    <>
      <AppShell
        tabs={props.tabs}
        renderTabIcon={props.renderTabIcon}
        floatingAction={props.floatingAction}
        stackScreens={props.stackScreens}
        onNotificationResponse={props.onNotificationResponse}
      />
      {props.authedOverlays}
    </>,
  );

  return (
    <NavigationContainer
      linking={props.linking}
      theme={{
        dark: isDark,
        // React Navigation 7 themes require a `fonts` block; reuse the library's defaults.
        fonts: (isDark ? DarkTheme : DefaultTheme).fonts,
        colors: {
          primary: theme.colors.primary,
          background: theme.colors.background,
          card: theme.colors.background,
          text: theme.colors.text,
          border: 'transparent',
          notification: theme.colors.error,
        },
      }}
    >
      {accessToken ? signedIn : <AuthStack />}
      <ToastProvider />
    </NavigationContainer>
  );
}
