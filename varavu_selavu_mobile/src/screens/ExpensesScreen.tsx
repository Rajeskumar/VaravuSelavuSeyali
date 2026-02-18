import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, TouchableOpacity, Modal, ActivityIndicator, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { listExpenses, deleteExpense, updateExpense, ExpenseRecord } from '../api/expenses';
import { theme } from '../theme';
import Card from '../components/Card';
import CustomInput from '../components/CustomInput';
import CustomButton from '../components/CustomButton';
import { showToast } from '../components/Toast';
import { ListSkeleton } from '../components/SkeletonLoader';

// Category emoji mapping
const categoryEmojis: Record<string, string> = {
    food: '🍕', groceries: '🛒', transport: '🚗', entertainment: '🎬',
    shopping: '🛍️', health: '🏥', utilities: '💡', rent: '🏠',
    travel: '✈️', education: '📚', subscription: '📱', other: '📋',
};

function getCategoryEmoji(category: string): string {
    return categoryEmojis[category?.toLowerCase().trim()] || '💳';
}

export default function ExpensesScreen() {
    const { accessToken, userEmail } = useAuth();
    const navigation = useNavigation<any>();
    const isFocused = useIsFocused();
    const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    // Edit Modal State
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
    const [editDescription, setEditDescription] = useState('');
    const [editAmount, setEditAmount] = useState('');
    const [editCategory, setEditCategory] = useState('');
    const [editDate, setEditDate] = useState('');

    const fetchExpenses = async (reset = false) => {
        if (!accessToken || !userEmail) return;
        if (reset) {
            setLoading(true);
            setOffset(0);
        }

        try {
            const currentOffset = reset ? 0 : offset;
            const data = await listExpenses(accessToken, userEmail, currentOffset, 20);

            if (reset) {
                setExpenses(data.items || []);
            } else {
                setExpenses((prev) => [...prev, ...(data.items || [])]);
            }

            setOffset(currentOffset + (data.items?.length || 0));
            setHasMore(!!data.next_offset);
        } catch (error) {
            console.error('Failed to fetch expenses', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isFocused && accessToken && userEmail) {
            fetchExpenses(true);
        }
    }, [isFocused, accessToken, userEmail]);

    const handleDelete = (rowId: number) => {
        Alert.alert('Delete Expense', 'Are you sure you want to delete this expense?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    try {
                        if (!accessToken) return;
                        await deleteExpense(rowId, accessToken);
                        showToast({ message: 'Expense deleted', type: 'success' });
                        fetchExpenses(true);
                    } catch (error) {
                        showToast({ message: 'Failed to delete expense', type: 'error' });
                    }
                },
            },
        ]);
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
            await updateExpense(
                editingExpense.row_id,
                {
                    description: editDescription,
                    cost: parseFloat(editAmount),
                    category: editCategory,
                    date: editDate,
                    sub_category: '',
                },
                accessToken,
            );
            setEditModalVisible(false);
            showToast({ message: 'Expense updated!', type: 'success' });
            fetchExpenses(true);
        } catch (error) {
            showToast({ message: 'Failed to update expense', type: 'error' });
        }
    };

    const renderItem = ({ item }: { item: ExpenseRecord }) => (
        <Card style={styles.card}>
            <View style={styles.cardRow}>
                {/* Category Icon */}
                <View style={styles.iconContainer}>
                    <Text style={styles.iconText}>{getCategoryEmoji(item.category)}</Text>
                </View>

                {/* Info */}
                <View style={styles.info}>
                    <Text style={styles.desc} numberOfLines={1}>{item.description}</Text>
                    <View style={styles.metaRow}>
                        <View style={styles.categoryBadge}>
                            <Text style={styles.categoryText}>{item.category}</Text>
                        </View>
                        <Text style={styles.dateText}>{item.date}</Text>
                    </View>
                </View>

                {/* Cost & Actions */}
                <View style={styles.cardRight}>
                    <Text style={styles.cost}>-${item.cost.toFixed(2)}</Text>
                    <View style={styles.actions}>
                        <TouchableOpacity onPress={() => handleEdit(item)} style={styles.actionBtn} activeOpacity={0.7}>
                            <Text style={styles.editText}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => handleDelete(item.row_id)}
                            style={[styles.actionBtn, styles.deleteBtn]}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.deleteText}>🗑️</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Card>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={theme.typography.h2}>History</Text>
                <Text style={styles.headerSubtitle}>
                    {expenses.length} transaction{expenses.length !== 1 ? 's' : ''}
                </Text>
            </View>

            {loading && expenses.length === 0 ? (
                <View style={{ paddingHorizontal: 20 }}>
                    <ListSkeleton count={5} />
                </View>
            ) : (
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
                        <Card style={styles.emptyCard}>
                            <Text style={styles.emptyIcon}>📭</Text>
                            <Text style={styles.emptyTitle}>No expenses yet</Text>
                            <Text style={styles.emptySubtitle}>Start tracking your spending</Text>
                        </Card>
                    }
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                />
            )}

            {/* Edit Modal */}
            <Modal visible={editModalVisible} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Edit Transaction</Text>

                        <CustomInput
                            label="Amount"
                            icon="💰"
                            value={editAmount}
                            onChangeText={setEditAmount}
                            keyboardType="numeric"
                        />
                        <CustomInput
                            label="Description"
                            icon="📝"
                            value={editDescription}
                            onChangeText={setEditDescription}
                        />
                        <CustomInput
                            label="Category"
                            icon="📂"
                            value={editCategory}
                            onChangeText={setEditCategory}
                        />
                        <CustomInput
                            label="Date"
                            icon="📅"
                            value={editDate}
                            onChangeText={setEditDate}
                            placeholder="YYYY-MM-DD"
                        />

                        <View style={styles.modalButtons}>
                            <CustomButton
                                title="Cancel"
                                variant="ghost"
                                onPress={() => setEditModalVisible(false)}
                                fullWidth={false}
                                style={{ flex: 1, marginRight: 10 }}
                            />
                            <CustomButton
                                title="Save Changes"
                                onPress={saveEdit}
                                fullWidth={false}
                                style={{ flex: 1 }}
                            />
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
        paddingTop: Platform.OS === 'android' ? 50 : 56,
    },
    header: {
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    headerSubtitle: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
    card: {
        marginBottom: 10,
        padding: 16,
    },
    cardRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 14,
        backgroundColor: theme.colors.primarySurface,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconText: {
        fontSize: 22,
    },
    info: {
        flex: 1,
        marginLeft: 14,
    },
    desc: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.text,
        marginBottom: 4,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    categoryBadge: {
        backgroundColor: theme.colors.primarySurface,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    categoryText: {
        fontSize: 11,
        fontWeight: '600',
        color: theme.colors.primary,
        textTransform: 'capitalize',
    },
    dateText: {
        fontSize: 12,
        color: theme.colors.textTertiary,
    },
    cardRight: {
        alignItems: 'flex-end',
        marginLeft: 8,
    },
    cost: {
        fontSize: 17,
        fontWeight: '700',
        color: theme.colors.error,
        marginBottom: 8,
    },
    actions: {
        flexDirection: 'row',
        gap: 6,
    },
    actionBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    deleteBtn: {
        backgroundColor: theme.colors.errorSurface,
    },
    editText: {
        fontSize: 16,
    },
    deleteText: {
        fontSize: 16,
    },
    emptyCard: {
        alignItems: 'center',
        paddingVertical: 40,
        marginTop: 20,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: 12,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: theme.colors.text,
        marginBottom: 4,
    },
    emptySubtitle: {
        fontSize: 14,
        color: theme.colors.textSecondary,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: theme.colors.overlay,
        justifyContent: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: theme.colors.surface,
        borderRadius: 24,
        padding: 28,
        ...theme.shadows.lg,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: '800',
        marginBottom: 24,
        color: theme.colors.text,
    },
    modalButtons: {
        flexDirection: 'row',
        marginTop: 12,
    },
});
