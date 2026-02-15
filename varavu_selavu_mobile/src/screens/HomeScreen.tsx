import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Button, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import API_BASE_URL from '../api/apiconfig';

interface DashboardData {
  income: number;
  expenses: number;
  balance: number;
}

export default function HomeScreen() {
  const { userEmail, accessToken, signOut } = useAuth();
  const navigation = useNavigation<any>();
  const [data, setData] = useState<DashboardData>({ income: 0, expenses: 0, balance: 0 });
  const [loading, setLoading] = useState(true);

  // Fetch dashboard data
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/analysis/monthly`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (response.ok) {
          const result = await response.json();
          // Assuming the API returns something like { total_income: 100, total_expenses: 50 }
          // If not, adjust based on actual API response structure
          setData({
            income: result.total_income || 0,
            expenses: result.total_expense || 0,
            balance: (result.total_income || 0) - (result.total_expense || 0),
          });
        }
      } catch (error) {
        console.error("Failed to fetch dashboard data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [accessToken]);

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.welcome}>Welcome back,</Text>
        <Text style={styles.email}>{userEmail}</Text>
      </View>

      <View style={styles.summaryContainer}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Income</Text>
          <Text style={[styles.cardAmount, { color: 'green' }]}>{formatCurrency(data.income)}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Expense</Text>
          <Text style={[styles.cardAmount, { color: 'red' }]}>{formatCurrency(data.expenses)}</Text>
        </View>
      </View>

      <View style={styles.balanceContainer}>
          <Text style={styles.balanceLabel}>Net Balance</Text>
          <Text style={[styles.balanceAmount, { color: data.balance >= 0 ? 'black' : 'red' }]}>
            {formatCurrency(data.balance)}
          </Text>
      </View>

      <View style={styles.actions}>
        <Button title="Add Expense" onPress={() => Alert.alert("Coming Soon", "Expense entry form to be implemented.")} />
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
    marginTop: 40,
  },
  welcome: {
    fontSize: 18,
    color: '#666',
  },
  email: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  card: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    width: '48%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 14,
    color: '#888',
  },
  cardAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 5,
  },
  balanceContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    elevation: 3,
  },
  balanceLabel: {
    fontSize: 16,
    color: '#888',
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 5,
  },
  actions: {
    marginBottom: 20,
  },
  logoutContainer: {
    marginTop: 20,
    marginBottom: 40,
  }
});
