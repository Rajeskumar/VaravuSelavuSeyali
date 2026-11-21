import React from 'react';
import { TabSpec } from '../core/navigation/types';
import TabBarIcon from './TabBarIcon';
import HomeScreen from '../features/home/screens/HomeScreen';
import ExpensesScreen from '../features/expenses/screens/ExpensesScreen';
import GroupsScreen from '../features/groups/screens/GroupsScreen';
import AnalysisScreen from '../features/insights/screens/AnalysisScreen';
import AIAnalystScreen from '../features/ask/screens/AIAnalystScreen';

// V2 nav: Home, Expenses, Groups, Insights, Ask. Route names are unchanged (deep links, `navigate()`
// calls and notification handlers all key off them) — only the labels the user sees are new.
export const tabs: TabSpec[] = [
  { name: 'Dashboard', component: HomeScreen, label: 'Home' },
  { name: 'Expenses', component: ExpensesScreen, label: 'Expenses' },
  { name: 'GroupsTab', component: GroupsScreen, label: 'Groups' },
  { name: 'Analysis', component: AnalysisScreen, label: 'Insights' },
  { name: 'AI Analyst', component: AIAnalystScreen, label: 'Ask' },
];

export const renderTabIcon = (name: string, color: string) => <TabBarIcon name={name} color={color} />;

// The primary "add" button only floats over the tabs where logging something is the next step.
export const FAB_TABS = ['Dashboard', 'Expenses', 'GroupsTab'];
