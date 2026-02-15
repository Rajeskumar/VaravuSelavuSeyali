import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Button, ScrollView, Alert, ActivityIndicator, FlatList } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { getAnalysis, AnalysisResponse } from '../api/analysis';

export default function HomeScreen() {
  const { userEmail, accessToken, signOut } = useAuth();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch dashboard data
  useEffect(() => {
    const fetchData = async () => {
      if (!accessToken || !isFocused) return;

      try {
        setLoading(true);
        const result = await getAnalysis(accessToken, {
            year: new Date().getFullYear(),
            month: new Date().getMonth() + 1
        });
        setData(result);
      } catch (error) {
        console.error("Failed to fetch dashboard data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [accessToken, isFocused]);

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  if (loading && !data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Calculate this month's totals
  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const thisMonthTotal = data?.monthly_trend.find(m => m.month === currentMonthKey)?.total || 0;

  // Recent transactions (flattening the category_expense_details)
  const recentExpenses = data?.category_expense_details
    ? Object.values(data.category_expense_details).flat().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5)
    : [];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.welcome}>Welcome back,</Text>
        <Text style={styles.email}>{userEmail}</Text>
      </View>

      <View style={styles.summaryContainer}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Total Expenses</Text>
          <Text style={[styles.cardAmount, { color: 'black' }]}>
            {formatCurrency(data?.total_expenses || 0)}
          </Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>This Month</Text>
          <Text style={[styles.cardAmount, { color: 'red' }]}>
            {formatCurrency(thisMonthTotal)}
          </Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <Button title="View All" onPress={() => navigation.navigate('Expenses')} />
      </View>

      <View style={styles.recentList}>
          {recentExpenses.length === 0 ? (
              <Text style={{textAlign: 'center', padding: 20, color: '#888'}}>No recent activity</Text>
          ) : (
              recentExpenses.map((expense, index) => (
                  <View key={index} style={styles.expenseItem}>
                      <View>
                          <Text style={styles.expenseDesc}>{expense.description}</Text>
                          <Text style={styles.expenseDate}>{expense.date} • {expense.category}</Text>
                      </View>
                      <Text style={styles.expenseCost}>-{formatCurrency(expense.cost)}</Text>
                  </View>
              ))
          )}
      </View>

      <View style={styles.actions}>
        <Button
            title="Add Expense"
            onPress={() => navigation.navigate('Add Expense')}
        />
      </View>

      <View style={styles.logoutContainer}>
        <Button title="Logout" onPress={signOut} color="red" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 20,
    marginTop: 10,
  },
  welcome: {
    fontSize: 18,
    color: '#666',
  },
  email: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  card: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    width: '48%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 5,
  },
  cardAmount: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
  },
  sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
  },
  recentList: {
      backgroundColor: 'white',
      borderRadius: 10,
      padding: 10,
      marginBottom: 20,
  },
  expenseItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: '#f0f0f0',
  },
  expenseDesc: {
      fontWeight: '500',
      fontSize: 16,
  },
  expenseDate: {
      color: '#888',
      fontSize: 12,
      marginTop: 2,
  },
  expenseCost: {
      color: 'red',
      fontWeight: 'bold',
  },
  actions: {
    marginBottom: 10,
  },
  logoutContainer: {
    marginBottom: 40,
  }
});
