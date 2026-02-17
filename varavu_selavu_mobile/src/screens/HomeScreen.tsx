import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { getAnalysis, AnalysisResponse } from '../api/analysis';
import { theme } from '../theme';
import { LinearGradient } from 'expo-linear-gradient';

export default function HomeScreen() {
  const { userEmail, accessToken, signOut } = useAuth();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    if (!accessToken) return;

    try {
      const result = await getAnalysis(accessToken, {
          year: new Date().getFullYear(),
          month: new Date().getMonth() + 1
      });
      setData(result);
    } catch (error) {
      console.error("Failed to fetch dashboard data", error);
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
  }, [isFocused, accessToken]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [accessToken]);

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  if (loading && !data && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // Calculate this month's totals
  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const thisMonthTotal = data?.monthly_trend.find(m => m.month === currentMonthKey)?.total || 0;

  // Recent transactions
  const recentExpenses = data?.category_expense_details
    ? Object.values(data.category_expense_details).flat().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5)
    : [];

  return (
    <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 80 }}
    >
      <View style={styles.header}>
        <View>
            <Text style={theme.typography.caption}>Welcome back,</Text>
            <Text style={theme.typography.h2}>{userEmail?.split('@')[0]}</Text>
        </View>
        <TouchableOpacity onPress={signOut} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

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
            <View>
                <Text style={styles.heroSubLabel}>Avg/Month</Text>
                <Text style={styles.heroSubAmount}>{formatCurrency((data?.total_expenses || 0) / 12)}</Text>
            </View>
        </View>
      </LinearGradient>

      <View style={styles.sectionHeader}>
          <Text style={theme.typography.h3}>Recent Activity</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Expenses')}>
              <Text style={{ color: theme.colors.primary }}>View All</Text>
          </TouchableOpacity>
      </View>

      <View>
          {recentExpenses.length === 0 ? (
              <View style={styles.emptyState}>
                  <Text style={theme.typography.caption}>No recent activity found.</Text>
              </View>
          ) : (
              recentExpenses.map((expense, index) => (
                  <View key={index} style={styles.expenseItem}>
                      <View style={styles.iconPlaceholder}>
                          <Text style={styles.iconText}>{expense.category.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 15 }}>
                          <Text style={styles.expenseDesc} numberOfLines={1}>{expense.description}</Text>
                          <Text style={styles.expenseDate}>{expense.date}</Text>
                      </View>
                      <Text style={styles.expenseCost}>-{formatCurrency(expense.cost)}</Text>
                  </View>
              ))
          )}
      </View>

      <View style={styles.quickActions}>
          <Text style={theme.typography.h3}>Quick Actions</Text>
          <View style={{ flexDirection: 'row', marginTop: 10 }}>
            <TouchableOpacity
                style={[styles.actionCard, { backgroundColor: '#E3F2FD' }]}
                onPress={() => navigation.navigate('Add Expense')}
            >
                <Text style={[styles.actionText, { color: '#1565C0' }]}>Add New</Text>
            </TouchableOpacity>
            <View style={{ width: 10 }} />
            <TouchableOpacity
                style={[styles.actionCard, { backgroundColor: '#F3E5F5' }]}
                onPress={() => navigation.navigate('Analysis')}
            >
                <Text style={[styles.actionText, { color: '#7B1FA2' }]}>Analytics</Text>
            </TouchableOpacity>
          </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoutBtn: {
    backgroundColor: '#FFEBEE',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  logoutText: {
    color: '#D32F2F',
    fontWeight: '600',
    fontSize: 12,
  },
  heroCard: {
    borderRadius: 20,
    padding: 25,
    marginBottom: 25,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginBottom: 5,
  },
  heroAmount: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  heroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    paddingTop: 15,
  },
  heroSubLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  heroSubAmount: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  expenseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  iconPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  expenseDesc: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  expenseDate: {
    fontSize: 12,
    color: '#999',
  },
  expenseCost: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#D32F2F',
  },
  emptyState: {
      padding: 20,
      alignItems: 'center',
      backgroundColor: '#fff',
      borderRadius: 15,
  },
  quickActions: {
      marginTop: 20,
  },
  actionCard: {
      flex: 1,
      padding: 15,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
  },
  actionText: {
      fontWeight: 'bold',
      marginTop: 5,
  }
});
