import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '../theme/ThemeContext';
import { AppTheme, inkOnPastel } from '../theme/theme';
import { CoreAppProps, FloatingActionSpec } from './types';

const Tab = createBottomTabNavigator();

// Tab screens render their own titles (ScreenHeader), so the native header is off.
function FloatingActionButton({ spec, theme }: { spec: FloatingActionSpec; theme: AppTheme }) {
  const styles = React.useMemo(() => createTabStyles(theme), [theme]);
  const onPress = spec.useOnPress();
  return (
    <TouchableOpacity
      style={styles.fabShadow}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={spec.accessibilityLabel}
      testID="fab.add"
    >
      <LinearGradient colors={theme.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
        <Ionicons name="add" size={30} color={inkOnPastel} />
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default function MainTabs({ tabs, renderTabIcon, floatingAction }: Pick<CoreAppProps, 'tabs' | 'renderTabIcon' | 'floatingAction'>) {
  const { theme, isDark } = useAppTheme();
  const tabStyles = React.useMemo(() => createTabStyles(theme), [theme]);
  const [activeTab, setActiveTab] = useState(tabs[0]?.name);
  const insets = useSafeAreaInsets();
  const labels = React.useMemo(() => Object.fromEntries(tabs.map((t) => [t.name, t.label ?? t.name])), [tabs]);

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
          tabBarIcon: ({ color }) => renderTabIcon(route.name, color),
          tabBarLabel: labels[route.name] ?? route.name,
          // Native E2E selector (qa/mobile); route names are contracts, so the id is derived from them.
          tabBarButtonTestID: `tabs.${route.name.replace(/\s+/g, '-')}`,
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
        {tabs.map((t) => <Tab.Screen key={t.name} name={t.name} component={t.component} />)}
      </Tab.Navigator>
      {floatingAction && activeTab && floatingAction.tabs.includes(activeTab) && (
        <FloatingActionButton spec={floatingAction} theme={theme} />
      )}
    </>
  );
}

const createTabStyles = (theme: AppTheme) => StyleSheet.create({
  tabLabel: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 10, letterSpacing: 0.1 },
  // Outer wrapper carries position + the glow shadow (theme.shadows.fab); the inner gradient fill
  // can't carry shadowColor itself on Android (elevation ignores it), but keeping the split means
  // iOS still gets the true glow.
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
