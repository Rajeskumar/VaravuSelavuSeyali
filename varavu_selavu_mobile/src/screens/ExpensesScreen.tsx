import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, TouchableOpacity, Modal, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { listExpenses, deleteExpense, updateExpense, ExpenseRecord } from '../api/expenses';
import { theme } from '../theme';

export default function ExpensesScreen() {
  const { accessToken } = useAuth();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Edit Mode
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDate, setEditDate] = useState('');

  const fetchExpenses = async (reset = false) => {
    if (!accessToken) return;
    if (reset) {
        setLoading(true);
        setOffset(0);
    }

    try {
        const currentOffset = reset ? 0 : offset;
        const data = await listExpenses(accessToken, currentOffset, 20);

        if (reset) {
            setExpenses(data.items);
        } else {
            setExpenses(prev => [...prev, ...data.items]);
        }

        if (data.next_offset) {
            setOffset(data.next_offset);
            setHasMore(true);
        } else {
            setHasMore(false);
        }
    } catch (error) {
        console.error("Failed to fetch expenses", error);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
        fetchExpenses(true);
    }
  }, [isFocused, accessToken]);

  const handleDelete = (rowId: number) => {
    Alert.alert(
        "Delete Expense",
        "Are you sure you want to delete this expense?",
        [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    try {
                        if (!accessToken) return;
                        await deleteExpense(rowId, accessToken);
                        fetchExpenses(true);
                    } catch (error) {
                        Alert.alert("Error", "Failed to delete expense");
                    }
                }
            }
        ]
    );
  };

  const handleEdit = (expense: ExpenseRecord) => {
      setEditingExpense(expense);
      setEditDescription(expense.description);
      setEditAmount(String(expense.cost));
      setEditCategory(expense.category);
      setEditDate(expense.date);
      setEditModalVisible(true);
  };

  const saveEdit = async () => {
      if (!editingExpense || !accessToken) return;
      try {
          await updateExpense(editingExpense.row_id, {
              description: editDescription,
              cost: parseFloat(editAmount),
              category: editCategory,
              date: editDate,
              sub_category: '',
          }, accessToken);
          setEditModalVisible(false);
          fetchExpenses(true);
      } catch (error) {
          Alert.alert("Error", "Failed to update expense");
      }
  };

  const renderItem = ({ item }: { item: ExpenseRecord }) => (
    <View style={styles.card}>
        <View style={styles.cardLeft}>
            <View style={styles.dateBox}>
                <Text style={styles.dateDay}>{item.date.split('-')[2]}</Text>
                <Text style={styles.dateMonth}>{new Date(item.date).toLocaleString('default', { month: 'short' })}</Text>
            </View>
            <View style={styles.info}>
                <Text style={styles.desc}>{item.description}</Text>
                <Text style={styles.category}>{item.category}</Text>
            </View>
        </View>
        <View style={styles.cardRight}>
            <Text style={styles.cost}>-${item.cost.toFixed(2)}</Text>
            <View style={styles.actions}>
                <TouchableOpacity onPress={() => handleEdit(item)} style={styles.editBtn}>
                    <Text style={styles.btnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item.row_id)} style={[styles.editBtn, styles.deleteBtn]}>
                    <Text style={[styles.btnText, { color: '#fff' }]}>Del</Text>
                </TouchableOpacity>
            </View>
        </View>
    </View>
  );

  return (
    <View style={styles.container}>
        <View style={styles.header}>
            <Text style={theme.typography.h2}>History</Text>
        </View>
        <FlatList
            data={expenses}
            renderItem={renderItem}
            keyExtractor={(item) => String(item.row_id)}
            onRefresh={() => fetchExpenses(true)}
            refreshing={loading}
            onEndReached={() => {
                if (hasMore && !loading) fetchExpenses(false);
            }}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No expenses found.</Text>
                </View>
            }
            contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        />

        <Modal visible={editModalVisible} animationType="fade" transparent>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Edit Transaction</Text>

                    <Text style={styles.label}>Amount</Text>
                    <TextInput style={styles.input} value={editAmount} onChangeText={setEditAmount} keyboardType="numeric" />

                    <Text style={styles.label}>Description</Text>
                    <TextInput style={styles.input} value={editDescription} onChangeText={setEditDescription} />

                    <Text style={styles.label}>Category</Text>
                    <TextInput style={styles.input} value={editCategory} onChangeText={setEditCategory} />

                    <Text style={styles.label}>Date</Text>
                    <TextInput style={styles.input} value={editDate} onChangeText={setEditDate} placeholder="YYYY-MM-DD" />

                    <View style={styles.modalButtons}>
                        <TouchableOpacity onPress={() => setEditModalVisible(false)} style={styles.cancelButton}>
                            <Text style={{ color: '#666' }}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={saveEdit} style={styles.saveButton}>
                            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Save Changes</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  card: {
      backgroundColor: '#fff',
      borderRadius: 16,
      padding: 15,
      marginBottom: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 5,
      elevation: 2,
  },
  cardLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
  },
  dateBox: {
      backgroundColor: '#F3E5F5',
      borderRadius: 10,
      padding: 8,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 15,
      minWidth: 50,
  },
  dateDay: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.colors.primary,
  },
  dateMonth: {
      fontSize: 10,
      color: theme.colors.primaryLight,
      textTransform: 'uppercase',
  },
  info: {
      flex: 1,
  },
  desc: {
      fontSize: 16,
      fontWeight: '600',
      color: '#333',
      marginBottom: 2,
  },
  category: {
      fontSize: 12,
      color: '#888',
      backgroundColor: '#f5f5f5',
      alignSelf: 'flex-start',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      overflow: 'hidden',
  },
  cardRight: {
      alignItems: 'flex-end',
  },
  cost: {
      fontSize: 16,
      fontWeight: 'bold',
      color: '#D32F2F',
      marginBottom: 8,
  },
  actions: {
      flexDirection: 'row',
  },
  editBtn: {
      backgroundColor: '#E3F2FD',
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 12,
      marginLeft: 8,
  },
  deleteBtn: {
      backgroundColor: '#FFEBEE',
  },
  btnText: {
      fontSize: 10,
      color: '#1565C0',
      fontWeight: 'bold',
  },
  emptyState: {
      alignItems: 'center',
      marginTop: 50,
  },
  emptyText: {
      color: '#888',
      fontSize: 16,
  },
  modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      padding: 20,
  },
  modalContent: {
      backgroundColor: 'white',
      borderRadius: 20,
      padding: 25,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 10,
  },
  modalTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      marginBottom: 20,
      color: '#333',
  },
  label: {
      fontSize: 12,
      fontWeight: 'bold',
      marginTop: 10,
      marginBottom: 5,
      color: '#666',
      textTransform: 'uppercase',
  },
  input: {
      borderBottomWidth: 1,
      borderBottomColor: '#ddd',
      paddingVertical: 8,
      fontSize: 16,
      color: '#333',
      marginBottom: 5,
  },
  modalButtons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 30,
  },
  cancelButton: {
      padding: 10,
      marginRight: 10,
  },
  saveButton: {
      backgroundColor: theme.colors.primary,
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 25,
  },
});
