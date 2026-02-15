import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Button, FlatList, Alert, ActivityIndicator, TouchableOpacity, Modal, TextInput } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { listExpenses, deleteExpense, updateExpense, ExpenseRecord } from '../api/expenses';

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
                        // Refresh list
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
              sub_category: '', // API might require this
          }, accessToken);
          setEditModalVisible(false);
          fetchExpenses(true);
          Alert.alert("Success", "Expense updated");
      } catch (error) {
          Alert.alert("Error", "Failed to update expense");
      }
  };

  const renderItem = ({ item }: { item: ExpenseRecord }) => (
    <View style={styles.itemContainer}>
        <View style={styles.itemMain}>
            <Text style={styles.itemDesc}>{item.description}</Text>
            <Text style={styles.itemSub}>{item.date} • {item.category}</Text>
        </View>
        <View style={styles.itemRight}>
            <Text style={styles.itemCost}>-${item.cost.toFixed(2)}</Text>
            <View style={styles.itemActions}>
                <TouchableOpacity onPress={() => handleEdit(item)} style={styles.actionBtn}>
                    <Text style={styles.actionText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item.row_id)} style={styles.actionBtn}>
                    <Text style={[styles.actionText, {color: 'red'}]}>Del</Text>
                </TouchableOpacity>
            </View>
        </View>
    </View>
  );

  return (
    <View style={styles.container}>
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
            ListEmptyComponent={<Text style={styles.emptyText}>No expenses found.</Text>}
        />

        <Modal visible={editModalVisible} animationType="slide" transparent>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Edit Expense</Text>

                    <Text style={styles.label}>Amount</Text>
                    <TextInput style={styles.input} value={editAmount} onChangeText={setEditAmount} keyboardType="numeric" />

                    <Text style={styles.label}>Description</Text>
                    <TextInput style={styles.input} value={editDescription} onChangeText={setEditDescription} />

                    <Text style={styles.label}>Category</Text>
                    <TextInput style={styles.input} value={editCategory} onChangeText={setEditCategory} />

                    <Text style={styles.label}>Date</Text>
                    <TextInput style={styles.input} value={editDate} onChangeText={setEditDate} placeholder="YYYY-MM-DD" />

                    <View style={styles.modalButtons}>
                        <Button title="Cancel" onPress={() => setEditModalVisible(false)} color="gray" />
                        <Button title="Save" onPress={saveEdit} />
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
    backgroundColor: '#fff',
  },
  itemContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: 15,
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
  },
  itemMain: {
      flex: 1,
  },
  itemRight: {
      alignItems: 'flex-end',
  },
  itemDesc: {
      fontSize: 16,
      fontWeight: '500',
  },
  itemSub: {
      fontSize: 12,
      color: '#666',
      marginTop: 2,
  },
  itemCost: {
      fontSize: 16,
      fontWeight: 'bold',
      color: '#333',
  },
  itemActions: {
      flexDirection: 'row',
      marginTop: 5,
  },
  actionBtn: {
      marginLeft: 10,
  },
  actionText: {
      fontSize: 12,
      color: '#007AFF',
  },
  emptyText: {
      textAlign: 'center',
      marginTop: 50,
      color: '#888',
  },
  modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      padding: 20,
  },
  modalContent: {
      backgroundColor: 'white',
      borderRadius: 10,
      padding: 20,
  },
  modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 20,
      textAlign: 'center',
  },
  label: {
      fontSize: 12,
      fontWeight: 'bold',
      marginTop: 10,
      marginBottom: 5,
      color: '#666',
  },
  input: {
      borderWidth: 1,
      borderColor: '#ddd',
      borderRadius: 5,
      padding: 10,
      marginBottom: 5,
  },
  modalButtons: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 20,
  },
});
