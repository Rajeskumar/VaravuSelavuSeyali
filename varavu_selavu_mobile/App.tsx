import React, { useRef, useState, useCallback, createContext, useContext } from 'react';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator, View, Text, TouchableOpacity, StyleSheet,
  Animated, Dimensions, Modal, SafeAreaView, Pressable,
} from 'react-native';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { theme } from './src/theme';
import ToastProvider from './src/components/Toast';
import TabIcon from './src/components/TabIcon';

import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HomeScreen from './src/screens/HomeScreen';
import AddExpenseScreen from './src/screens/AddExpenseScreen';
import ExpensesScreen from './src/screens/ExpensesScreen';
import AnalysisScreen from './src/screens/AnalysisScreen';
import AIAnalystScreen from './src/screens/AIAnalystScreen';
import RecurringExpensesScreen from './src/screens/RecurringExpensesScreen';
import AboutScreen from './src/screens/AboutScreen';
import FeatureRequestScreen from './src/screens/FeatureRequestScreen';
import ContactUsScreen from './src/screens/ContactUsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// ─── Drawer Context ────────────────────────────────────────
// Allows any screen to open/close the custom drawer via context.

interface DrawerContextType {
  openDrawer: () => void;
  closeDrawer: () => void;
}
const DrawerContext = createContext<DrawerContextType>({
  openDrawer: () => { },
  closeDrawer: () => { },
});
export const useDrawer = () => useContext(DrawerContext);

// ─── Auth Stack ────────────────────────────────────────────

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

// ─── Main Bottom Tabs ──────────────────────────────────────

function MainTabs() {
  const { openDrawer } = useDrawer();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        headerShown: true,
        tabBarShowLabel: false,
        headerStyle: {
          backgroundColor: theme.colors.background,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 0,
        },
        headerTitleStyle: { fontWeight: '700', fontSize: 18, color: theme.colors.text },
        headerLeft: () => (
          <TouchableOpacity onPress={openDrawer} style={tabStyles.hamburger} activeOpacity={0.6}>
            <Text style={tabStyles.hamburgerIcon}>☰</Text>
          </TouchableOpacity>
        ),
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopWidth: 0,
          height: 72,
          paddingBottom: 10,
          paddingTop: 8,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 12,
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={HomeScreen}
        options={{
          headerTitle: '',
          headerTransparent: true,
          tabBarIcon: ({ focused }) => <TabIcon icon="🏠" label="Home" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Expenses"
        component={ExpensesScreen}
        options={{
          headerTitle: 'History',
          tabBarIcon: ({ focused }) => <TabIcon icon="📋" label="History" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Add Expense"
        component={AddExpenseScreen}
        options={{
          headerTitle: 'Add Expense',
          tabBarIcon: ({ focused }) => <TabIcon icon="＋" label="Add" focused={focused} isCenter />,
        }}
      />
      <Tab.Screen
        name="Analysis"
        component={AnalysisScreen}
        options={{
          headerTitle: 'Stats',
          tabBarIcon: ({ focused }) => <TabIcon icon="📊" label="Stats" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="AI Analyst"
        component={AIAnalystScreen}
        options={{
          headerTitle: 'AI Chat',
          tabBarIcon: ({ focused }) => <TabIcon icon="🤖" label="AI Chat" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

const tabStyles = StyleSheet.create({
  hamburger: { marginLeft: 16, padding: 4 },
  hamburgerIcon: { fontSize: 24, color: theme.colors.text },
});

// ─── Custom JS-Only Drawer ─────────────────────────────────

const DRAWER_W = Dimensions.get('window').width * 0.78;

interface DrawerMenuItem {
  key: string;
  label: string;
  icon: string;
  screen?: string;
}

const DRAWER_ITEMS: DrawerMenuItem[] = [
  { key: 'home', label: 'Home', icon: '🏠', screen: 'MainTabs' },
  { key: 'recurring', label: 'Recurring Expenses', icon: '🔁', screen: 'Recurring' },
  { key: 'about', label: 'About App', icon: 'ℹ️', screen: 'About' },
  { key: 'feature', label: 'Submit Feature Request', icon: '💡', screen: 'FeatureRequest' },
  { key: 'contact', label: 'Contact Us', icon: '✉️', screen: 'ContactUs' },
];

function CustomDrawer({
  visible,
  onClose,
  onNavigate,
}: {
  visible: boolean;
  onClose: () => void;
  onNavigate: (screen: string) => void;
}) {
  const { signOut, userEmail } = useAuth();
  const slideAnim = useRef(new Animated.Value(-DRAWER_W)).current;
  const insets = useSafeAreaInsets();

  React.useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -DRAWER_W,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  const handleLogout = () => {
    onClose();
    signOut();
  };

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      {/* Backdrop */}
      <Pressable style={drawerStyles.backdrop} onPress={onClose}>
        {/* We use a touchable without feedback to prevent closes when clicking inside the drawer itself */}
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Animated.View style={[drawerStyles.container, { transform: [{ translateX: slideAnim }] }]}>
            <View style={{ flex: 1 }}>
              {/* Header */}
              <View style={[drawerStyles.header, { paddingTop: Math.max(insets.top, 20) }]}>
                <View style={drawerStyles.logoRow}>
                  <View style={drawerStyles.logoCircle}>
                    <Text style={{ fontSize: 26 }}>💰</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={drawerStyles.appName}>Varavu Selavu</Text>
                    <Text style={drawerStyles.userEmail} numberOfLines={1}>
                      {userEmail || 'Expense Tracker'}
                    </Text>
                  </View>
                </View>
                {/* Close Button placed absolutely in the top right of the drawer */}
                <TouchableOpacity onPress={onClose} style={[drawerStyles.closeButton, { top: Math.max(insets.top, 10) }]} activeOpacity={0.6}>
                  <Text style={drawerStyles.closeIcon}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Menu Items */}
              <View style={drawerStyles.menuList}>
                {DRAWER_ITEMS.map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    style={drawerStyles.menuItem}
                    activeOpacity={0.6}
                    onPress={() => {
                      onClose();
                      if (item.screen) onNavigate(item.screen);
                    }}
                  >
                    <Text style={drawerStyles.menuIcon}>{item.icon}</Text>
                    <Text style={drawerStyles.menuLabel}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Logout at bottom */}
              <View style={drawerStyles.footer}>
                <TouchableOpacity style={drawerStyles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
                  <Text style={drawerStyles.logoutIcon}>🚪</Text>
                  <Text style={drawerStyles.logoutText}>Logout</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const drawerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    flexDirection: 'row',
  },
  container: {
    width: DRAWER_W,
    backgroundColor: theme.colors.surface,
    flex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  header: {
    backgroundColor: theme.colors.primarySurface,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  logoCircle: {
    width: 50, height: 50, borderRadius: 16,
    backgroundColor: theme.colors.primary,
    alignItems: 'center', justifyContent: 'center',
    ...theme.shadows.colored,
  },
  appName: { fontSize: 20, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.3 },
  userEmail: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  menuList: { flex: 1, paddingTop: 12, paddingHorizontal: 12 },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 14,
    borderRadius: 12, marginBottom: 2,
  },
  menuIcon: { fontSize: 20, marginRight: 14, width: 28, textAlign: 'center' },
  menuLabel: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  footer: {
    borderTopWidth: 1, borderTopColor: theme.colors.border,
    padding: 16, paddingBottom: 36,
  },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.colors.errorSurface, paddingVertical: 14,
    paddingHorizontal: 16, borderRadius: 14,
  },
  logoutIcon: { fontSize: 20, marginRight: 12 },
  logoutText: { fontSize: 15, fontWeight: '700', color: theme.colors.error },
  closeButton: {
    padding: 8,
    position: 'absolute',
    top: 10,
    right: 12,
  },
  closeIcon: { fontSize: 20, color: theme.colors.textTertiary, fontWeight: '700' },
});

// ─── App Shell (Stack with Drawer) ────────────────────────

function AppShell() {
  const navigation = useNavigation<any>();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const handleNavigate = useCallback((screen: string) => {
    navigation.navigate(screen);
  }, [navigation]);

  return (
    <DrawerContext.Provider value={{ openDrawer, closeDrawer }}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen
          name="Recurring"
          component={RecurringExpensesScreen}
          options={{ headerShown: true, headerTitle: 'Recurring Expenses', headerBackTitle: 'Back' }}
        />
        <Stack.Screen
          name="About"
          component={AboutScreen}
          options={{ headerShown: true, headerTitle: 'About', headerBackTitle: 'Back' }}
        />
        <Stack.Screen
          name="FeatureRequest"
          component={FeatureRequestScreen}
          options={{ headerShown: true, headerTitle: 'Feature Request', headerBackTitle: 'Back' }}
        />
        <Stack.Screen
          name="ContactUs"
          component={ContactUsScreen}
          options={{ headerShown: true, headerTitle: 'Contact Us', headerBackTitle: 'Back' }}
        />
      </Stack.Navigator>
      <CustomDrawer visible={drawerOpen} onClose={closeDrawer} onNavigate={handleNavigate} />
    </DrawerContext.Provider>
  );
}

// ─── Root Navigator ────────────────────────────────────────

function RootNavigator() {
  const { accessToken, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer
      theme={{
        dark: false,
        colors: {
          primary: theme.colors.primary,
          background: theme.colors.background,
          card: theme.colors.surface,
          text: theme.colors.text,
          border: theme.colors.border,
          notification: theme.colors.error,
        },
      }}
    >
      {accessToken ? <AppShell /> : <AuthStack />}
      <ToastProvider />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" backgroundColor={theme.colors.background} />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
