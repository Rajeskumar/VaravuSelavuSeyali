import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { getAnalysis, AnalysisResponse } from '../api/analysis';
import { theme } from '../theme';
import { LinearGradient } from 'expo-linear-gradient';
import ScreenWrapper from '../components/ScreenWrapper';
import Card from '../components/Card';
import { HeroSkeleton, ListSkeleton } from '../components/SkeletonLoader';

// Category emoji mapping for visual richness
const categoryEmojis: Record<string, string> = {
  food: '🍕',
  groceries: '🛒',
  transport: '🚗',
  entertainment: '🎬',
  shopping: '🛍️',
  health: '🏥',
  utilities: '💡',
  rent: '🏠',
  travel: '✈️',
  education: '📚',
  subscription: '📱',
  salary: '💰',
  investment: '📈',
  other: '📋',
};

function getCategoryEmoji(category: string): string {
  const key = category?.toLowerCase().trim();
  return categoryEmojis[key] || '💳';
}

export default function HomeScreen() {
  const { userEmail, accessToken, signOut } = useAuth();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    if (!accessToken || !userEmail) return;
    try {
      const result = await getAnalysis(accessToken, userEmail, {
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
      });
      setData(result);
    } catch (error) {
      console.error('Failed to fetch dashboard data', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      setLoading(true);
      fetchData();
    }
  }, [isFocused]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [accessToken]);

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const thisMonthTotal = data?.monthly_trend.find((m) => m.month === currentMonthKey)?.total || 0;

  const recentExpenses = data?.category_expense_details
    ? Object.values(data.category_expense_details)
      .flat()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5)
    : [];

  // Show skeleton while initial loading
  if (loading && !data && !refreshing) {
    return (
      <ScreenWrapper scroll>
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeLabel}>Welcome back,</Text>
            <Text style={theme.typography.h2}>{userEmail?.split('@')[0]}</Text>
          </View>
        </View>
        <HeroSkeleton />
        <ListSkeleton count={3} />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper
      scroll
      style={{ paddingTop: 0 }}
      contentStyle={{ paddingHorizontal: 0 }}
    >
      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeLabel}>Welcome back,</Text>
          <Text style={theme.typography.h2}>{userEmail?.split('@')[0]}</Text>
        </View>
        <TouchableOpacity onPress={signOut} style={styles.logoutBtn} activeOpacity={0.7}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Hero Spending Card */}
      <View style={styles.heroWrapper}>
        <LinearGradient
          colors={[theme.colors.gradientStart, theme.colors.gradientEnd]}
          style={styles.heroCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.heroLabel}>Total Spent This Year</Text>
          <Text style={styles.heroAmount}>{formatCurrency(data?.total_expenses || 0)}</Text>
          <View style={styles.heroFooter}>
            <View>
              <Text style={styles.heroSubLabel}>This Month</Text>
              <Text style={styles.heroSubAmount}>{formatCurrency(thisMonthTotal)}</Text>
            </View>
            <View style={styles.heroDivider} />
            <View>
              <Text style={styles.heroSubLabel}>Avg/Month</Text>
              <Text style={styles.heroSubAmount}>{formatCurrency((data?.total_expenses || 0) / 12)}</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      <View style={styles.bodyContent}>
        {/* Recent Activity */}
        <View style={styles.sectionHeader}>
          <Text style={theme.typography.h3}>Recent Activity</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Expenses')} activeOpacity={0.7}>
            <Text style={styles.viewAllText}>View All →</Text>
          </TouchableOpacity>
        </View>

        {recentExpenses.length === 0 ? (
          <Card>
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTitle}>No recent activity</Text>
              <Text style={styles.emptySubtitle}>Add your first expense to get started</Text>
            </View>
          </Card>
        ) : (
          recentExpenses.map((expense, index) => (
            <Card key={index} style={styles.expenseCard}>
              <View style={styles.expenseRow}>
                <View style={styles.expenseIcon}>
                  <Text style={styles.expenseIconText}>{getCategoryEmoji(expense.category)}</Text>
                </View>
                <View style={styles.expenseInfo}>
                  <Text style={styles.expenseDesc} numberOfLines={1}>{expense.description}</Text>
                  <Text style={styles.expenseDate}>{expense.date}</Text>
                </View>
                <Text style={styles.expenseCost}>-{formatCurrency(expense.cost)}</Text>
              </View>
            </Card>
          ))
        )}

        {/* Quick Actions */}
        <Text style={[theme.typography.h3, { marginTop: 8, marginBottom: 14 }]}>Quick Actions</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: theme.colors.primarySurface }]}
            onPress={() => navigation.navigate('Add Expense')}
            activeOpacity={0.7}
          >
            <Text style={styles.actionEmoji}>➕</Text>
            <Text style={[styles.actionLabel, { color: theme.colors.primaryDark }]}>Add New</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: '#EFF6FF' }]}
            onPress={() => navigation.navigate('Analysis')}
            activeOpacity={0.7}
          >
            <Text style={styles.actionEmoji}>📊</Text>
            <Text style={[styles.actionLabel, { color: '#1E40AF' }]}>Analytics</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: '#FFF7ED' }]}
            onPress={() => navigation.navigate('AI Analyst')}
            activeOpacity={0.7}
          >
            <Text style={styles.actionEmoji}>🤖</Text>
            <Text style={[styles.actionLabel, { color: '#9A3412' }]}>AI Chat</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 20,
  },
  welcomeLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '500',
    marginBottom: 2,
  },
  logoutBtn: {
    backgroundColor: theme.colors.errorSurface,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    minHeight: 36,
    justifyContent: 'center',
  },
  logoutText: {
    color: theme.colors.error,
    fontWeight: '700',
    fontSize: 13,
  },
  heroWrapper: {
    paddingHorizontal: 20,
  },
  heroCard: {
    borderRadius: 24,
    padding: 28,
    marginBottom: 28,
    ...theme.shadows.colored,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  heroAmount: {
    color: '#fff',
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1,
    marginBottom: 22,
  },
  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    paddingTop: 18,
  },
  heroDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 28,
  },
  heroSubLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '500',
  },
  heroSubAmount: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  bodyContent: {
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  viewAllText: {
    color: theme.colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  expenseCard: {
    marginBottom: 10,
    padding: 16,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expenseIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expenseIconText: {
    fontSize: 22,
  },
  expenseInfo: {
    flex: 1,
    marginLeft: 14,
  },
  expenseDesc: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 3,
  },
  expenseDate: {
    fontSize: 13,
    color: theme.colors.textTertiary,
  },
  expenseCost: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.error,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    borderRadius: 16,
    ...theme.shadows.sm,
  },
  actionEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
});
