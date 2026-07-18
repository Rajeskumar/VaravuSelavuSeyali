import React, { useRef, useState, useCallback, useEffect, createContext, useContext } from 'react';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import {
  ActivityIndicator, View, Text, TouchableOpacity, StyleSheet,
  Dimensions, Modal, Pressable, Platform, SafeAreaView, Linking
} from 'react-native';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';

import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_900Black,
} from '@expo-google-fonts/inter';
import { SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk';

import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { ZoomIn, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useAppTheme } from './src/context/ThemeContext';
import { AppTheme, withAlpha, motion } from './src/theme';
import ToastProvider from './src/components/Toast';
import RecurringPrompt from './src/components/RecurringPrompt';
import AnimatedPressable from './src/components/AnimatedPressable';

import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HomeScreen from './src/screens/HomeScreen';
import ExpensesScreen from './src/screens/ExpensesScreen';
import AnalysisScreen from './src/screens/AnalysisScreen';
import AIAnalystScreen from './src/screens/AIAnalystScreen';
import RecurringExpensesScreen from './src/screens/RecurringExpensesScreen';
import AboutScreen from './src/screens/AboutScreen';
import FeedbackScreen from './src/screens/FeedbackScreen';
import ItemInsightsScreen from './src/screens/ItemInsightsScreen';
import MerchantInsightsScreen from './src/screens/MerchantInsightsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import GroupsScreen from './src/screens/GroupsScreen';
import GroupDetailScreen from './src/screens/GroupDetailScreen';
import JoinGroupScreen from './src/screens/JoinGroupScreen';

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

// ─── Drawer Context ───────────────────────────────────────────────────────────
interface DrawerContextType { openDrawer: () => void; closeDrawer: () => void; }
const DrawerContext = createContext<DrawerContextType>({ openDrawer: () => {}, closeDrawer: () => {} });
export const useDrawer = () => useContext(DrawerContext);

// ─── Native Bottom Tab Bar with Blur & FAB ─────────────────────────────────


// ─── Auth Stack ───────────────────────────────────────────────────────────────
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

const DummyScreen = () => null;

// 5 bottom tabs: Home, Expenses, Analysis, Groups, AI Analyst.
function MainTabs() {
  const { openDrawer } = useDrawer();
  const { theme, isDark } = useAppTheme();
  const tabStyles = React.useMemo(() => createTabStyles(theme), [theme]);
  const { openAddExpense } = useContext(AddExpenseContext);

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: true,
          headerStyle: {
            backgroundColor: theme.colors.background,
            shadowColor: 'transparent',
            elevation: 0,
            borderBottomWidth: 0,
          },
          headerTitleStyle: {
            fontFamily: 'Inter-Bold',
            fontSize: 18,
            color: theme.colors.text,
          },
          headerLeft: () => (
            <TouchableOpacity
              onPress={openDrawer}
              style={tabStyles.menuBtn}
              activeOpacity={0.6}
            >
              <Text style={tabStyles.menuBtnIcon}>☰</Text>
            </TouchableOpacity>
          ),
          tabBarIcon: ({ focused, color, size }) => {
            let iconName = '';
            if (route.name === 'Dashboard') iconName = focused ? 'home' : 'home-outline';
            else if (route.name === 'Expenses') iconName = focused ? 'wallet' : 'wallet-outline';
            else if (route.name === 'GroupsTab') iconName = focused ? 'people' : 'people-outline';
            else if (route.name === 'Analysis') iconName = focused ? 'pie-chart' : 'pie-chart-outline';
            else if (route.name === 'AI Analyst') iconName = focused ? 'sparkles' : 'sparkles-outline';
            return <Ionicons name={iconName as any} size={size} color={color} />;
          },
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textTertiary,
          tabBarStyle: {
            position: 'absolute',
            borderTopWidth: 0,
            elevation: 0,
            backgroundColor: 'transparent',
          },
          tabBarBackground: () => (
            <BlurView tint={isDark ? 'dark' : 'light'} intensity={80} style={StyleSheet.absoluteFill} />
          ),
        })}
      >
        <Tab.Screen
          name="Dashboard"
          component={HomeScreen}
          options={{ headerTitle: '' }}
        />
        <Tab.Screen
          name="Expenses"
          component={ExpensesScreen}
          options={{ headerTitle: 'Transactions' }}
        />
        <Tab.Screen
          name="GroupsTab"
          component={GroupsScreen}
          options={{ headerTitle: 'Groups', tabBarLabel: 'Groups' }}
        />
        <Tab.Screen
          name="Analysis"
          component={AnalysisScreen}
          options={{ headerTitle: 'Insights' }}
        />
        <Tab.Screen
          name="AI Analyst"
          component={AIAnalystScreen}
          options={{ headerTitle: 'AI Chat' }}
        />
      </Tab.Navigator>
      <TouchableOpacity
        style={tabStyles.fab}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          openAddExpense();
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>
    </>
  );
}

const createTabStyles = (theme: AppTheme) => StyleSheet.create({
  menuBtn: {
    marginLeft: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.xs,
  },
  menuBtnIcon: { fontSize: 15, color: theme.colors.text },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: Platform.OS === 'ios' ? 100 : 80, // Above the tab bar
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 999,
  },

});

// ─── iOS-style Slide-in Drawer ────────────────────────────────────────────────
const DRAWER_W = Dimensions.get('window').width * 0.80;

// Profile/AI Analyst/Recurring removed per explicit request: Profile is reachable via the Home
// avatar icon now, AI Analyst is a bottom tab again, and Recurring is a sub-tab of Expenses.
const DRAWER_ITEMS: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; screen: string }[] = [
  { key: 'home',            label: 'Home',             icon: 'home',           screen: 'Dashboard'       },
  { key: 'itemInsights',    label: 'Item Insights',    icon: 'pricetag',       screen: 'ItemInsights'    },
  { key: 'merchantInsights',label: 'Merchant Insights',icon: 'storefront',     screen: 'MerchantInsights'},
  { key: 'about',           label: 'About',            icon: 'information-circle', screen: 'About'      },
  { key: 'feedback',        label: 'Feedback',         icon: 'chatbubble-ellipses', screen: 'Feedback'  },
];

function CustomDrawer({ visible, onClose, onNavigate }: {
  visible: boolean; onClose: () => void; onNavigate: (s: string) => void;
}) {
  const { signOut, userEmail } = useAuth();
  const slideAnim = useSharedValue(-DRAWER_W);
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const drawerStyles = React.useMemo(() => createDrawerStyles(theme), [theme]);

  React.useEffect(() => {
    slideAnim.value = withSpring(visible ? 0 : -DRAWER_W, motion.spring);
  }, [visible]);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideAnim.value }],
  }));

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={drawerStyles.backdrop} onPress={onClose}>
        <Animated.View style={[drawerStyles.sheet, sheetAnimatedStyle]}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ flex: 1 }}>

            <View style={[drawerStyles.header, { paddingTop: Math.max(insets.top + 12, 40) }]}>
              <View style={drawerStyles.avatarCircle}>
                <Text style={drawerStyles.avatarText}>{userEmail?.charAt(0).toUpperCase() || '?'}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={drawerStyles.appTitle}>TrackSpense</Text>
                <Text style={drawerStyles.userEmail} numberOfLines={1}>{userEmail}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={drawerStyles.closeBtn}>
                <Text style={drawerStyles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={drawerStyles.menuSection}>
              {DRAWER_ITEMS.map((item, index) => (
                <React.Fragment key={item.key}>
                  <TouchableOpacity
                    style={drawerStyles.menuRow}
                    activeOpacity={0.6}
                    onPress={() => { onClose(); if (item.screen) onNavigate(item.screen); }}
                  >
                    <View style={drawerStyles.menuIconBox}>
                      <Ionicons name={item.icon} size={18} color={theme.colors.primary} />
                    </View>
                    <Text style={drawerStyles.menuLabel}>{item.label}</Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
                  </TouchableOpacity>
                  {index < DRAWER_ITEMS.length - 1 && (
                    <View style={drawerStyles.separator} />
                  )}
                </React.Fragment>
              ))}
            </View>

            <View style={[drawerStyles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
              <TouchableOpacity
                style={drawerStyles.signOutBtn}
                onPress={() => { onClose(); signOut(); }}
                activeOpacity={0.7}
              >
                <Text style={drawerStyles.signOutText}>Sign Out</Text>
              </TouchableOpacity>
            </View>

          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const createDrawerStyles = (theme: AppTheme) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', flexDirection: 'row' },
  sheet: {
    width: DRAWER_W, flex: 1, backgroundColor: theme.colors.background,
    shadowColor: '#000', shadowOffset: { width: 8, height: 0 },
    shadowOpacity: 0.12, shadowRadius: 24, elevation: 20,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight,
  },
  avatarCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: theme.colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, color: '#fff', fontFamily: 'Inter-Bold' },
  appTitle: { fontFamily: 'Inter-Bold', fontSize: 17, color: theme.colors.text },
  userEmail: { fontFamily: 'Inter-Regular', fontSize: 13, color: theme.colors.textTertiary, marginTop: 2 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: theme.colors.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14, color: theme.colors.textSecondary, fontFamily: 'Inter-SemiBold' },
  menuSection: {
    margin: 16, backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl, overflow: 'hidden',
    ...theme.shadows.xs,
  },
  menuRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16, minHeight: 52,
  },
  menuIconBox: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: theme.colors.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  menuLabel: { flex: 1, fontFamily: 'Inter-Regular', fontSize: 17, color: theme.colors.text },
  chevron: { fontSize: 18, color: theme.colors.textQuaternary },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.borderLight, marginLeft: 62 },
  footer: { paddingHorizontal: 16, marginTop: 'auto' },
  signOutBtn: {
    alignItems: 'center', paddingVertical: 16,
    backgroundColor: theme.colors.errorSurface, borderRadius: theme.borderRadius.xl,
  },
  signOutText: { fontFamily: 'Inter-SemiBold', fontSize: 17, color: theme.colors.error },
});

// ─── App Shell ────────────────────────────────────────────────────────────────
function AppShell() {
  const navigation = useNavigation<any>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { theme } = useAppTheme();

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const handleNavigate = useCallback((screen: string) => navigation.navigate(screen), [navigation]);

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
    <DrawerContext.Provider value={{ openDrawer, closeDrawer }}>
      <Stack.Navigator screenOptions={{
        headerShown: false,
        headerTintColor: theme.colors.primary,
        headerStyle: { backgroundColor: theme.colors.background },
        headerTitleStyle: { fontFamily: 'Inter-Bold', color: theme.colors.text },
        headerBackTitleStyle: { fontFamily: 'Inter-Regular' },
      }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="Profile"          component={ProfileScreen}            options={{ headerShown: true, headerTitle: 'Profile',            headerBackTitle: '' }} />
        <Stack.Screen name="Recurring"        component={RecurringExpensesScreen}  options={{ headerShown: true, headerTitle: 'Recurring',         headerBackTitle: '' }} />
        <Stack.Screen name="ItemInsights"     component={ItemInsightsScreen}       options={{ headerShown: true, headerTitle: 'Item Insights',      headerBackTitle: '' }} />
        <Stack.Screen name="MerchantInsights" component={MerchantInsightsScreen}   options={{ headerShown: true, headerTitle: 'Merchant Insights',  headerBackTitle: '' }} />
        <Stack.Screen name="About"            component={AboutScreen}              options={{ headerShown: true, headerTitle: 'About',              headerBackTitle: '' }} />
        <Stack.Screen name="Feedback"         component={FeedbackScreen}           options={{ headerShown: true, headerTitle: 'Feedback',           headerBackTitle: '' }} />
        {/* ── Groups (TS-GRP-109) ── */}
        <Stack.Screen name="Groups"           component={GroupsScreen}             options={{ headerShown: false }} />
        <Stack.Screen name="GroupDetail"      component={GroupDetailScreen}        options={{ headerShown: true, headerBackTitle: '' }} />
        <Stack.Screen name="JoinGroup"        component={JoinGroupScreen}          options={{ headerShown: true, headerTitle: 'Join Group', headerBackTitle: '' }} />
      </Stack.Navigator>
      <CustomDrawer visible={drawerOpen} onClose={closeDrawer} onNavigate={handleNavigate} />
    </DrawerContext.Provider>
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
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor="transparent" translucent />
      <RootNavigator />
    </>
  );
}

// ─── App Entry ────────────────────────────────────────────────────────────────
export default function App() {
  const [fontsLoaded] = useFonts({
    'Inter-Regular':  Inter_400Regular,
    'Inter-Medium':   Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold':     Inter_700Bold,
    'Inter-Black':    Inter_900Black,
    // Reconcile display face (docs/design/TrackSpense_UX_Design_Spec.md §3) — True Total / big
    // balances only, per src/theme.ts's `displayHero`/`display` typography roles.
    'SpaceGrotesk-SemiBold': SpaceGrotesk_600SemiBold,
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

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#e74c3c',
  },
  errorText: {
    fontSize: 14,
    color: '#7f8c8d',
    textAlign: 'center',
  },
});
