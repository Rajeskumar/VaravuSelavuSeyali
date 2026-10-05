import React, { useState, useEffect, useContext } from 'react';
import { NavigationContainer, useNavigation, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import {
  ActivityIndicator, View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  useFonts,
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans';
import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';

import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import TabBarIcon from './src/components/TabBarIcon';
import * as Haptics from 'expo-haptics';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useAppTheme } from './src/context/ThemeContext';
import { AppTheme, inkOnPastel } from './src/theme';
import ToastProvider from './src/components/Toast';
import RecurringPrompt from './src/components/RecurringPrompt';

import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import HomeScreen from './src/screens/HomeScreen';
import ExpensesScreen from './src/screens/ExpensesScreen';
import AnalysisScreen from './src/screens/AnalysisScreen';
import AIAnalystScreen from './src/screens/AIAnalystScreen';
import RecurringExpensesScreen from './src/screens/RecurringExpensesScreen';
import AboutScreen from './src/screens/AboutScreen';
import FeedbackScreen from './src/screens/FeedbackScreen';
import ItemDetailScreen from './src/screens/ItemDetailScreen';
import MerchantDetailScreen from './src/screens/MerchantDetailScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import GroupsScreen from './src/screens/GroupsScreen';
import GroupDetailScreen from './src/screens/GroupDetailScreen';
import JoinGroupScreen from './src/screens/JoinGroupScreen';
import ActivityScreen from './src/screens/ActivityScreen';
import CardsScreen from './src/screens/CardsScreen';
import TagsScreen from './src/screens/TagsScreen';

import AddExpenseProvider, { AddExpenseContext } from './src/screens/AddExpenseScreen';
import { extractGroupIdFromNotificationData } from './src/notifications';

const Stack = createNativeStackNavigator();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function ErrorFallback({ error, resetErrorBoundary }: any) {
  return (
    <SafeAreaView style={styles.errorContainer}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorText}>{error.message}</Text>
    </SafeAreaView>
  );
}
const Tab = createBottomTabNavigator();

// ─── Auth Stack ───────────────────────────────────────────────────────────────
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}

// V2 nav: Home, Expenses, Groups, Insights, Ask. Route names are unchanged (deep links, `navigate()`
// calls and notification handlers all key off them) — only the labels the user sees are new.
// Tab screens render their own 28px titles (ScreenHeader), so the native header is off.
const TAB_LABELS: Record<string, string> = {
  Dashboard: 'Home',
  Expenses: 'Expenses',
  GroupsTab: 'Groups',
  Analysis: 'Insights',
  'AI Analyst': 'Ask',
};
// The primary "add" button only floats over the tabs where logging something is the next step.
const FAB_TABS = ['Dashboard', 'Expenses', 'GroupsTab'];

function MainTabs() {
  const { theme, isDark } = useAppTheme();
  const tabStyles = React.useMemo(() => createTabStyles(theme), [theme]);
  const { openAddExpense } = useContext(AddExpenseContext);
  const [activeTab, setActiveTab] = useState('Dashboard');
  const insets = useSafeAreaInsets();

  return (
    <>
      <Tab.Navigator
        screenListeners={({ navigation }) => ({
          state: () => {
            const nav = navigation.getState();
            const name = nav?.routes?.[nav.index]?.name;
            if (name) setActiveTab(name);
          },
        })}
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ color }) => <TabBarIcon name={route.name} color={color} />,
          tabBarLabel: TAB_LABELS[route.name] ?? route.name,
          tabBarLabelStyle: tabStyles.tabLabel,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textTertiary,
          // 84px total with the home-indicator inset folded in, 12px above the icons, 6px between
          // icon and label — the design's tab bar geometry.
          tabBarStyle: {
            position: 'absolute',
            height: 62 + insets.bottom,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 8),
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: theme.colors.borderLight,
            elevation: 0,
            backgroundColor: 'transparent',
          },
          tabBarItemStyle: { paddingVertical: 0 },
          tabBarIconStyle: { marginBottom: 2 },
          tabBarBackground: () => (
            <BlurView tint={isDark ? 'dark' : 'light'} intensity={80} style={StyleSheet.absoluteFill} />
          ),
        })}
      >
        <Tab.Screen name="Dashboard" component={HomeScreen} />
        <Tab.Screen name="Expenses" component={ExpensesScreen} />
        <Tab.Screen name="GroupsTab" component={GroupsScreen} />
        <Tab.Screen name="Analysis" component={AnalysisScreen} />
        <Tab.Screen name="AI Analyst" component={AIAnalystScreen} />
      </Tab.Navigator>
      {FAB_TABS.includes(activeTab) && (
        <TouchableOpacity
          style={tabStyles.fabShadow}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            openAddExpense();
          }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Add expense"
        >
          <LinearGradient colors={theme.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={tabStyles.fab}>
            <Ionicons name="add" size={30} color={inkOnPastel} />
          </LinearGradient>
        </TouchableOpacity>
      )}
    </>
  );
}

const createTabStyles = (theme: AppTheme) => StyleSheet.create({
  tabLabel: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 10, letterSpacing: 0.1 },
  // Outer wrapper carries position + the CerebroOS glow shadow (theme.shadows.fab); the inner
  // gradient fill (LinearGradient, App() render) can't carry shadowColor itself on Android
  // (elevation ignores it), but keeping the split means iOS still gets the true glow.
  fabShadow: {
    position: 'absolute',
    right: 22,
    bottom: 98, // Above the 84px tab bar
    width: 54,
    height: 54,
    borderRadius: 27,
    zIndex: 999,
    ...theme.shadows.fab,
  },
  fab: {
    flex: 1,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── App Shell ────────────────────────────────────────────────────────────────
function AppShell() {
  const navigation = useNavigation<any>();

  // Tapping a push notification (TS-GRP-110) deep-links straight to the group it's
  // about, whether the app was foregrounded/backgrounded or launched fresh from it.
  useEffect(() => {
    const goToGroup = (data: Record<string, unknown> | undefined) => {
      const groupId = extractGroupIdFromNotificationData(data);
      if (groupId) navigation.navigate('GroupDetail', { groupId });
    };

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) goToGroup(response.notification.request.content.data as Record<string, unknown>);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      goToGroup(response.notification.request.content.data as Record<string, unknown>);
    });
    return () => subscription.remove();
  }, [navigation]);

  return (
    <>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        {/* Pushed screens draw their own V2 header (ScreenHeader with back) — native bar is off. */}
        <Stack.Screen name="Activity"         component={ActivityScreen} />
        <Stack.Screen name="Profile"          component={ProfileScreen} />
        <Stack.Screen name="Recurring"        component={RecurringExpensesScreen} />
        <Stack.Screen name="ItemDetail"       component={ItemDetailScreen} />
        <Stack.Screen name="MerchantDetail"   component={MerchantDetailScreen} />
        <Stack.Screen name="Cards"            component={CardsScreen} />
        <Stack.Screen name="Tags"             component={TagsScreen} />
        <Stack.Screen name="About"            component={AboutScreen} />
        <Stack.Screen name="Feedback"         component={FeedbackScreen} />
        {/* ── Groups (TS-GRP-109) ── */}
        <Stack.Screen name="Groups"           component={GroupsScreen} />
        <Stack.Screen name="GroupDetail"      component={GroupDetailScreen} />
        <Stack.Screen name="JoinGroup"        component={JoinGroupScreen} />
      </Stack.Navigator>
    </>
  );
}

// ─── Root Navigator ───────────────────────────────────────────────────────────
function RootNavigator() {
  const { accessToken, isLoading } = useAuth();
  const { theme, isDark } = useAppTheme();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // Deep-link configuration for invite URLs: trackspense://join/{token}
  const linking = {
    prefixes: ['trackspense://', 'https://trackspense.app'],
    config: {
      screens: {
        JoinGroup: 'join/:token',
        Groups: 'groups',
        GroupDetail: 'groups/:groupId',
      },
    },
  };

  return (
    <NavigationContainer
      linking={linking}
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
      {accessToken ? (
        <AddExpenseProvider>
          <AppShell />
          <RecurringPrompt />
        </AddExpenseProvider>
      ) : (
        <AuthStack />
      )}
      <ToastProvider />
    </NavigationContainer>
  );
}

// Renders the status bar with the correct contrast for the active theme.
function ThemedStatusBarAndNav() {
  const { isDark } = useAppTheme();
  return (
    <>
      {/* SDK 57 is edge-to-edge only: the status bar is always transparent, so the old
          backgroundColor/translucent props no longer exist. */}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </>
  );
}

// ─── App Entry ────────────────────────────────────────────────────────────────
export default function App() {
  const [fontsLoaded] = useFonts({
    'InstrumentSans-Regular':  InstrumentSans_400Regular,
    'InstrumentSans-Medium':   InstrumentSans_500Medium,
    'InstrumentSans-SemiBold': InstrumentSans_600SemiBold,
    'InstrumentSans-Bold':     InstrumentSans_700Bold,
    // CerebroOS display face — True Total / big balances only, per src/theme.ts's
    // `displayHero`/`display` typography roles.
    'BricolageGrotesque-SemiBold': BricolageGrotesque_600SemiBold,
    // CerebroOS mono/eyebrow face — section labels and status badges.
    'IBMPlexMono-Regular': IBMPlexMono_400Regular,
    'IBMPlexMono-Medium':  IBMPlexMono_500Medium,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <ThemeProvider>
            <AuthProvider>
              <ThemedStatusBarAndNav />
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

// Outside ThemeProvider (ErrorBoundary wraps it), so this can't read useAppTheme() — hardcoded
// to the CerebroOS ink palette directly rather than left on the old light fallback, which would
// have flashed a jarring white screen on top of an otherwise all-dark app.
const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#05060A',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#F87171',
  },
  errorText: {
    fontSize: 14,
    color: '#9AA0AF',
    textAlign: 'center',
  },
});
