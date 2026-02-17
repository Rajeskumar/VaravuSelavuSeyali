import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { theme } from './src/theme';

import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HomeScreen from './src/screens/HomeScreen';
import AddExpenseScreen from './src/screens/AddExpenseScreen';
import ExpensesScreen from './src/screens/ExpensesScreen';
import AnalysisScreen from './src/screens/AnalysisScreen';
import AIAnalystScreen from './src/screens/AIAnalystScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
        screenOptions={{
            tabBarActiveTintColor: theme.colors.primary,
            tabBarInactiveTintColor: theme.colors.textSecondary,
            headerShown: false, // We'll manage headers inside screens or globally
            tabBarStyle: {
                backgroundColor: theme.colors.surface,
                borderTopWidth: 0,
                elevation: 10,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                height: 60,
                paddingBottom: 8,
                paddingTop: 8,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
            },
            tabBarLabelStyle: {
                fontSize: 10,
                fontWeight: '600',
            }
        }}
    >
      <Tab.Screen
        name="Dashboard"
        component={HomeScreen}
        options={{
            tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen
        name="Expenses"
        component={ExpensesScreen}
        options={{
            tabBarLabel: 'History',
        }}
      />
      <Tab.Screen
        name="Add Expense"
        component={AddExpenseScreen}
        options={{
            tabBarLabel: 'Add',
            tabBarIconStyle: {
                backgroundColor: theme.colors.primary,
                borderRadius: 25,
                height: 50,
                width: 50,
                top: -15, // Floating effect
            },
            tabBarActiveTintColor: '#fff',
            tabBarInactiveTintColor: '#eee',
        }}
      />
      <Tab.Screen
        name="Analysis"
        component={AnalysisScreen}
        options={{
            tabBarLabel: 'Stats',
        }}
      />
      <Tab.Screen
        name="AI Analyst"
        component={AIAnalystScreen}
        options={{
            tabBarLabel: 'AI Chat',
        }}
      />
    </Tab.Navigator>
  );
}

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
    <NavigationContainer theme={{
        dark: false,
        colors: {
            primary: theme.colors.primary,
            background: theme.colors.background,
            card: theme.colors.surface,
            text: theme.colors.text,
            border: theme.colors.border,
            notification: theme.colors.error,
        }
    }}>
      {accessToken ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="dark" backgroundColor={theme.colors.background} />
      <RootNavigator />
    </AuthProvider>
  );
}
