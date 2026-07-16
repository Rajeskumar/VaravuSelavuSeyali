/**
 * ExpensesScreen.tsx — TrackSpense v3 Mobile mock's "Expenses" tab (`isExpenses` block): a
 * "Transactions | Recurring" segmented toggle; Transactions is a day-grouped feed combining
 * personal and group expenses (colored dot per category, not the heavier icon-badge `ExpenseCard`
 * treatment); Recurring is a flat list of templates with a due/active pill + a monthly total
 * footer. Previously this screen was titled "History", had no tabs, no day-grouping, and only
 * showed personal expenses via a heavier bordered-card-per-row list — none of that matched the
 * mock. Edit/delete/move-to-group functionality is unchanged, just reachable via a row's "⋯"
 * action-sheet instead of always-visible icon buttons (group-expense rows are read-only here —
 * editing those happens in GroupDetailScreen; tapping one navigates there instead).
 */
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, Modal, Platform, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { listExpenses, deleteExpense, updateExpense, ExpenseRecord } from '../api/expenses';
import { listGroups, getGroupDetail, moveExpenseToGroup, listAllMyGroupExpenses, UnifiedGroupExpenseRow, GroupSummary, ApiError } from '../api/groups';
import { listRecurringTemplates, upsertRecurringTemplate, executeRecurringNow, RecurringTemplateDTO, UpsertRecurringPayload } from '../api/recurring';
import { CATEGORY_GROUPS, MAIN_CATEGORIES, findMainCategory } from '../constants/categories';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import CustomInput from '../components/CustomInput';
import CustomButton from '../components/CustomButton';
import SegmentedTabs from '../components/SegmentedTabs';
import SplitEditor, { SplitEditorValue } from '../components/SplitEditor';
import { showToast } from '../components/Toast';
import { ListSkeleton } from '../components/SkeletonLoader';
import { formatCurrency } from '../utils/currencyMath';
import { onExpenseChanged } from '../utils/expenseEvents';

const categoryDotColors: Record<string, string> = {
    food: '#B45309', groceries: '#B45309', dining: '#B45309',
    home: '#3F3F9E', rent: '#3F3F9E', utilities: '#3F3F9E',
    transport: '#15803D', transportation: '#15803D',
    entertainment: '#7B7BC4', shopping: '#7B7BC4',
};

function dotColorFor(category: string): string {
    return categoryDotColors[category?.toLowerCase().trim()] || '#A1A1AA';
}

/** Mock's `r.ran`/"Logged today" pill — derived from `last_processed_iso` (persists across
 * app restarts) rather than session-only local state. */
function ranToday(template: RecurringTemplateDTO): boolean {
    if (!template.last_processed_iso) return false;
    const today = new Date();
    const processed = new Date(template.last_processed_iso);
    return (
        processed.getFullYear() === today.getFullYear() &&
        processed.getMonth() === today.getMonth() &&
        processed.getDate() === today.getDate()
    );
}

type Tab = 'transactions' | 'recurring';

interface FeedRow {
    key: string;
    date: string;
    desc: string;
    meta: string;
    amount: number;
    category: string;
    onPress?: () => void;
}

export default function ExpensesScreen() {
    const { accessToken, userEmail } = useAuth();
    const navigation = useNavigation<any>();
    const isFocused = useIsFocused();
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const qc = useQueryClient();
    const [tab, setTab] = useState<Tab>('transactions');
    const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    // Edit Modal State
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
    const [editDescription, setEditDescription] = useState('');
    const [editAmount, setEditAmount] = useState('');
    const [editMainCategory, setEditMainCategory] = useState(MAIN_CATEGORIES[0]);
    const [editSubcategory, setEditSubcategory] = useState(CATEGORY_GROUPS[MAIN_CATEGORIES[0]][0]);
    const [editDate, setEditDate] = useState('');
    const [editMerchantName, setEditMerchantName] = useState('');

    // TrackSpense v3 Mobile mock's recurring row expand/edit/run-now (`r.expanded`/`r.editing`) —
    // was previously a flat, non-interactive row.
    const [recOpenId, setRecOpenId] = useState<string | null>(null);
    const [recEdit, setRecEdit] = useState<{ id: string; description: string; category: string; day_of_month: string; default_cost: string } | null>(null);

    // TS-GRP-121: Move-to-group modal state
    const [moveModalVisible, setMoveModalVisible] = useState(false);
    const [movingExpense, setMovingExpense] = useState<ExpenseRecord | null>(null);
    const [moveGroupId, setMoveGroupId] = useState<string | null>(null);
    const [moveSplit, setMoveSplit] = useState<SplitEditorValue>({ type: 'equal', entries: [] });
    const [moving, setMoving] = useState(false);

    const { data: groupsData } = useQuery({
        queryKey: ['groups'],
        queryFn: () => listGroups(),
        retry: (count, err) => (err instanceof ApiError && err.status === 404 ? false : count < 1),
        staleTime: 60_000,
    });
    const groupsEnabled = Array.isArray(groupsData);
    const myGroups: GroupSummary[] = groupsData ?? [];

    const { data: groupExpenses } = useQuery({
        queryKey: ['groupExpenses', userEmail],
        queryFn: () => listAllMyGroupExpenses().catch(() => []),
        enabled: !!accessToken && !!userEmail && groupsEnabled,
    });

    const { data: recurringTemplates, isLoading: loadingRecurring } = useQuery({
        queryKey: ['recurringTemplates', userEmail],
        queryFn: () => listRecurringTemplates().catch(() => []),
        enabled: !!accessToken && !!userEmail && tab === 'recurring',
    });

    const { data: moveGroupDetail } = useQuery({
        queryKey: ['group-detail-for-move', moveGroupId],
        queryFn: () => getGroupDetail(moveGroupId as string),
        enabled: !!moveGroupId,
    });

    useEffect(() => {
        if (!moveGroupDetail) return;
        setMoveSplit({ type: 'equal', entries: moveGroupDetail.members.map((m) => ({ member_id: m.member_id })) });
    }, [moveGroupDetail]);

    const fetchExpenses = async (reset = false) => {
        if (!accessToken || !userEmail) return;
        if (reset) {
            setLoading(true);
            setOffset(0);
        }

        try {
            const currentOffset = reset ? 0 : offset;
            const data = await listExpenses(accessToken, userEmail, currentOffset, 50);

            if (reset) {
                setExpenses(data.items || []);
            } else {
                setExpenses((prev) => {
                    const newItems = (data.items || []).filter(
                        (item: ExpenseRecord) => !prev.some((p) => p.row_id === item.row_id)
                    );
                    return [...prev, ...newItems];
                });
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

    // TS-DES-112: the global "+" opens as a Modal overlay (not a navigator screen), so
    // useIsFocused() never toggles when it closes — refetch on the expense-changed signal too.
    useEffect(() => onExpenseChanged(() => {
        fetchExpenses(true);
        qc.invalidateQueries({ queryKey: ['groupExpenses'] });
        qc.invalidateQueries({ queryKey: ['recurringTemplates'] });
    }), [accessToken, userEmail]);

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
        const mc = findMainCategory(expense.category);
        setEditMainCategory(mc);
        setEditSubcategory(expense.category);
        setEditDate(expense.date);
        setEditMerchantName(expense.merchant_name || '');
        setEditModalVisible(true);
    };

    const openMoveModal = (expense: ExpenseRecord) => {
        setMovingExpense(expense);
        setMoveGroupId(null);
        setMoveSplit({ type: 'equal', entries: [] });
        setMoveModalVisible(true);
    };

    const handleMove = async () => {
        if (!movingExpense || !moveGroupId) return;
        setMoving(true);
        try {
            await moveExpenseToGroup(movingExpense.row_id, {
                group_id: moveGroupId,
                split: { type: moveSplit.type, entries: moveSplit.entries },
            });
            setMoveModalVisible(false);
            showToast({ message: 'Expense moved to group', type: 'success' });
            fetchExpenses(true);
        } catch (error) {
            showToast({
                message: error instanceof ApiError ? error.message : 'Failed to move expense to group',
                type: 'error',
            });
        } finally {
            setMoving(false);
        }
    };

    const saveEdit = async () => {
        if (!editingExpense || !accessToken || !userEmail) return;
        try {
            await updateExpense(
                editingExpense.row_id,
                {
                    description: editDescription,
                    cost: parseFloat(editAmount),
                    category: editSubcategory,
                    date: editDate,
                    sub_category: editSubcategory,
                    user_id: userEmail,
                    merchant_name: editMerchantName || undefined,
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

    const showRowActions = (expense: ExpenseRecord) => {
        const buttons: any[] = [
            { text: 'Edit', onPress: () => handleEdit(expense) },
        ];
        if (groupsEnabled) buttons.push({ text: 'Move to group', onPress: () => openMoveModal(expense) });
        buttons.push({ text: 'Delete', style: 'destructive', onPress: () => handleDelete(expense.row_id) });
        buttons.push({ text: 'Cancel', style: 'cancel' });
        Alert.alert(expense.description, undefined, buttons);
    };

    // ── Day-grouped feed (personal + group expenses combined), mirrors the mock's `expDays`. ──
    const dayGroups = useMemo(() => {
        const personalRows: FeedRow[] = expenses.map((e) => ({
            key: `p-${e.row_id}`,
            date: e.date,
            desc: e.description,
            meta: `Personal · ${e.category}`,
            amount: e.cost,
            category: e.category,
            onPress: () => showRowActions(e),
        }));
        const groupRows: FeedRow[] = (groupExpenses || []).map((e: UnifiedGroupExpenseRow) => ({
            key: `g-${e.row_id}`,
            date: e.date,
            desc: e.description,
            meta: `${e.group_name} · your share ${formatCurrency(e.my_share)}`,
            amount: e.my_share,
            category: e.category,
            onPress: () => navigation.navigate('GroupDetail', { groupId: e.group_id }),
        }));
        const all = [...personalRows, ...groupRows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const order: string[] = [];
        const map: Record<string, FeedRow[]> = {};
        all.forEach((row) => {
            if (!map[row.date]) { map[row.date] = []; order.push(row.date); }
            map[row.date].push(row);
        });
        return order.map((date) => ({ date, rows: map[date] }));
    }, [expenses, groupExpenses]);

    // ── Recurring tab: simple day-of-month heuristic for due/active, matching the mock's pill. ──
    const recurringRows = useMemo(() => {
        const todayDay = new Date().getDate();
        return (recurringTemplates || []).map((t: RecurringTemplateDTO) => ({
            ...t,
            isDue: t.day_of_month < todayDay,
        }));
    }, [recurringTemplates]);
    const activeRecurringTotal = useMemo(
        () => (recurringTemplates || []).reduce((sum, t) => sum + t.default_cost, 0),
        [recurringTemplates]
    );

    const saveRecurringEditMut = useMutation({
        mutationFn: (payload: UpsertRecurringPayload) => upsertRecurringTemplate(payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['recurringTemplates'] });
            setRecEdit(null);
        },
        onError: () => showToast({ message: 'Failed to save template', type: 'error' }),
    });

    const runRecurringMut = useMutation({
        mutationFn: (templateId: string) => executeRecurringNow(templateId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['recurringTemplates'] });
            fetchExpenses(true);
            qc.invalidateQueries({ queryKey: ['groupExpenses'] });
            showToast({ message: 'Logged today', type: 'success' });
        },
        onError: () => showToast({ message: 'Failed to run template', type: 'error' }),
    });

    const openRecurringEdit = (t: RecurringTemplateDTO) => {
        setRecEdit({ id: t.id, description: t.description, category: t.category, day_of_month: String(t.day_of_month), default_cost: t.default_cost.toFixed(2) });
    };

    const saveRecurringEdit = (t: RecurringTemplateDTO) => {
        if (!recEdit) return;
        const day = Math.max(1, Math.min(31, parseInt(recEdit.day_of_month, 10) || t.day_of_month));
        const cost = parseFloat(recEdit.default_cost) || 0;
        if (!recEdit.description.trim() || cost <= 0) return;
        saveRecurringEditMut.mutate({
            description: recEdit.description.trim(),
            category: recEdit.category,
            day_of_month: day,
            default_cost: cost,
            start_date_iso: t.start_date_iso,
            status: t.status || 'Active',
        });
    };

    return (
        <LinearGradient colors={theme.gradients.surface} style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Expenses</Text>
            </View>

            <View style={styles.tabsRow}>
                <SegmentedTabs<Tab>
                    value={tab}
                    onChange={setTab}
                    options={[
                        { value: 'transactions', label: 'Transactions' },
                        { value: 'recurring', label: 'Recurring' },
                    ]}
                />
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
                {tab === 'transactions' ? (
                    loading && expenses.length === 0 ? (
                        <ListSkeleton count={5} />
                    ) : dayGroups.length === 0 ? (
                        <View style={styles.emptyCard}>
                            <Text style={styles.emptyIcon}>📭</Text>
                            <Text style={styles.emptyTitle}>No expenses yet</Text>
                            <Text style={styles.emptySubtitle}>Start tracking your spending</Text>
                        </View>
                    ) : (
                        dayGroups.map((group) => (
                            <View key={group.date} style={styles.dayGroup}>
                                <Text style={styles.dayLabel}>{group.date}</Text>
                                <View style={styles.dayCard}>
                                    {group.rows.map((row, i) => (
                                        <TouchableOpacity
                                            key={row.key}
                                            style={[styles.row, i === group.rows.length - 1 && styles.rowLast]}
                                            onPress={row.onPress}
                                            activeOpacity={0.7}
                                        >
                                            <View style={[styles.dot, { backgroundColor: dotColorFor(row.category) }]} />
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <Text style={styles.rowDesc} numberOfLines={1}>{row.desc}</Text>
                                                <Text style={styles.rowMeta} numberOfLines={1}>{row.meta}</Text>
                                            </View>
                                            <Text style={styles.rowAmount}>{formatCurrency(row.amount)}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        ))
                    )
                ) : loadingRecurring ? (
                    <ListSkeleton count={4} />
                ) : recurringRows.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyIcon}>🔁</Text>
                        <Text style={styles.emptyTitle}>No recurring expenses</Text>
                        <Text style={styles.emptySubtitle}>Templates you set up will appear here</Text>
                    </View>
                ) : (
                    <View style={styles.dayCard}>
                        {recurringRows.map((r, i) => {
                            const expanded = recOpenId === r.id;
                            const editing = expanded && recEdit?.id === r.id;
                            const ran = ranToday(r);
                            return (
                                <View key={r.id} style={i === recurringRows.length - 1 && styles.recurringRowLast}>
                                    <TouchableOpacity
                                        style={styles.row}
                                        activeOpacity={0.7}
                                        onPress={() => { setRecOpenId(expanded ? null : r.id); setRecEdit(null); }}
                                    >
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Text style={styles.rowDesc} numberOfLines={1}>{r.description}</Text>
                                            <Text style={styles.rowMeta} numberOfLines={1}>{r.category} · day {r.day_of_month}</Text>
                                        </View>
                                        <View style={[styles.pill, ran ? styles.pillRan : r.isDue ? styles.pillDue : styles.pillActive]}>
                                            <Text style={[styles.pillText, ran ? styles.pillTextRan : r.isDue ? styles.pillTextDue : styles.pillTextActive]}>
                                                {ran ? 'logged today' : r.isDue ? `due ${r.day_of_month}th` : 'active'}
                                            </Text>
                                        </View>
                                        <Text style={styles.recurringAmount}>{formatCurrency(r.default_cost)}</Text>
                                        <Text style={styles.recurringChevron}>{expanded ? '▾' : '▸'}</Text>
                                    </TouchableOpacity>

                                    {expanded && (
                                        <View style={styles.recurringExpand}>
                                            {editing ? (
                                                <>
                                                    <Text style={styles.pickerLabel}>NAME</Text>
                                                    <CustomInput
                                                        value={recEdit!.description}
                                                        onChangeText={(v) => setRecEdit((s) => (s ? { ...s, description: v } : s))}
                                                        containerStyle={{ marginBottom: 10 }}
                                                    />
                                                    <View style={styles.rowFields}>
                                                        <View style={styles.halfField}>
                                                            <Text style={styles.pickerLabel}>AMOUNT</Text>
                                                            <CustomInput
                                                                value={recEdit!.default_cost}
                                                                onChangeText={(v) => setRecEdit((s) => (s ? { ...s, default_cost: v } : s))}
                                                                keyboardType="decimal-pad"
                                                                containerStyle={{ marginBottom: 10 }}
                                                            />
                                                        </View>
                                                        <View style={styles.halfField}>
                                                            <Text style={styles.pickerLabel}>DAY</Text>
                                                            <CustomInput
                                                                value={recEdit!.day_of_month}
                                                                onChangeText={(v) => setRecEdit((s) => (s ? { ...s, day_of_month: v } : s))}
                                                                keyboardType="number-pad"
                                                                containerStyle={{ marginBottom: 10 }}
                                                            />
                                                        </View>
                                                    </View>
                                                    <Text style={styles.pickerLabel}>CATEGORY</Text>
                                                    <View style={[styles.pickerContent, { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }]}>
                                                        {MAIN_CATEGORIES.map((mc) => (
                                                            <TouchableOpacity
                                                                key={mc}
                                                                style={[styles.pickerChip, recEdit!.category === mc && styles.pickerChipActive]}
                                                                onPress={() => setRecEdit((s) => (s ? { ...s, category: mc } : s))}
                                                                activeOpacity={0.7}
                                                            >
                                                                <Text style={[styles.pickerChipText, recEdit!.category === mc && styles.pickerChipTextActive]}>{mc}</Text>
                                                            </TouchableOpacity>
                                                        ))}
                                                    </View>
                                                    <View style={styles.recurringEditActions}>
                                                        <CustomButton
                                                            title={saveRecurringEditMut.isPending ? 'Saving…' : 'Save changes'}
                                                            onPress={() => saveRecurringEdit(r)}
                                                            disabled={saveRecurringEditMut.isPending}
                                                            fullWidth={false}
                                                            style={{ flex: 1 }}
                                                        />
                                                        <CustomButton
                                                            title="Cancel"
                                                            variant="ghost"
                                                            onPress={() => setRecEdit(null)}
                                                            fullWidth={false}
                                                            style={{ flex: 1 }}
                                                        />
                                                    </View>
                                                </>
                                            ) : (
                                                <View style={styles.recurringActionsRow}>
                                                    {ran ? (
                                                        <Text style={styles.recurringRanText}>✓ Logged today</Text>
                                                    ) : (
                                                        <TouchableOpacity
                                                            style={styles.recurringRunBtn}
                                                            onPress={() => runRecurringMut.mutate(r.id)}
                                                            disabled={runRecurringMut.isPending}
                                                            activeOpacity={0.8}
                                                        >
                                                            <Text style={styles.recurringRunBtnText}>▶ Run now</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                    <TouchableOpacity style={styles.recurringEditBtn} onPress={() => openRecurringEdit(r)} activeOpacity={0.8}>
                                                        <Text style={styles.recurringEditBtnText}>✎ Edit</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            )}
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                        <View style={styles.recurringFooter}>
                            <Text style={styles.recurringFooterLabel}>Active recurring total</Text>
                            <Text style={styles.recurringFooterAmount}>{formatCurrency(activeRecurringTotal)}/mo</Text>
                        </View>
                    </View>
                )}
            </ScrollView>

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
                            label="Merchant / Store Name"
                            icon="🏪"
                            placeholder="e.g., Starbucks, Amazon"
                            value={editMerchantName}
                            onChangeText={setEditMerchantName}
                        />
                        {/* Main Category Picker */}
                        <Text style={styles.pickerLabel}>📁  Main Category</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll} contentContainerStyle={styles.pickerContent}>
                            {MAIN_CATEGORIES.map((mc) => (
                                <TouchableOpacity
                                    key={mc}
                                    style={[styles.pickerChip, editMainCategory === mc && styles.pickerChipActive]}
                                    onPress={() => {
                                        setEditMainCategory(mc);
                                        setEditSubcategory(CATEGORY_GROUPS[mc][0]);
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.pickerChipText, editMainCategory === mc && styles.pickerChipTextActive]}>{mc}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* Subcategory Picker */}
                        <Text style={styles.pickerLabel}>📂  Subcategory</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll} contentContainerStyle={styles.pickerContent}>
                            {(CATEGORY_GROUPS[editMainCategory] || []).map((sub) => (
                                <TouchableOpacity
                                    key={sub}
                                    style={[styles.pickerChip, editSubcategory === sub && styles.pickerChipActive]}
                                    onPress={() => setEditSubcategory(sub)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.pickerChipText, editSubcategory === sub && styles.pickerChipTextActive]}>{sub}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <CustomInput
                            label="Date"
                            icon="📅"
                            value={editDate}
                            onChangeText={setEditDate}
                            placeholder="MM/DD/YYYY"
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

            {/* Move to Group Modal (TS-GRP-121) */}
            <Modal visible={moveModalVisible} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Move to Group</Text>

                        <Text style={styles.pickerLabel}>👥  Group</Text>
                        <ScrollView style={{ maxHeight: 160 }} showsVerticalScrollIndicator={false}>
                            {myGroups.map((g) => (
                                <TouchableOpacity
                                    key={g.group_id}
                                    style={[styles.pickerChip, moveGroupId === g.group_id && styles.pickerChipActive, { marginBottom: 8 }]}
                                    onPress={() => setMoveGroupId(g.group_id)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.pickerChipText, moveGroupId === g.group_id && styles.pickerChipTextActive]}>{g.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {moveGroupDetail && movingExpense && (
                            <SplitEditor
                                members={moveGroupDetail.members}
                                totalAmount={movingExpense.cost}
                                value={moveSplit}
                                onChange={setMoveSplit}
                            />
                        )}

                        <View style={styles.modalButtons}>
                            <CustomButton
                                title="Cancel"
                                variant="ghost"
                                onPress={() => setMoveModalVisible(false)}
                                fullWidth={false}
                                style={{ flex: 1, marginRight: 10 }}
                            />
                            <CustomButton
                                title={moving ? 'Moving…' : 'Move'}
                                onPress={handleMove}
                                disabled={!moveGroupId || moving}
                                fullWidth={false}
                                style={{ flex: 1 }}
                            />
                        </View>
                    </View>
                </View>
            </Modal>
        </LinearGradient>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: Platform.OS === 'android' ? 50 : 56,
    },
    header: {
        paddingHorizontal: 18,
        marginBottom: 4,
    },
    headerTitle: {
        fontFamily: 'SpaceGrotesk-SemiBold',
        fontSize: 22,
        color: theme.colors.text,
        letterSpacing: -0.3,
    },
    tabsRow: {
        paddingHorizontal: 18,
        marginTop: 12,
        marginBottom: 14,
        alignSelf: 'flex-start',
    },
    dayGroup: { marginBottom: 14 },
    dayLabel: {
        fontFamily: 'Inter-Bold',
        fontSize: 11,
        color: theme.colors.textTertiary,
        letterSpacing: 0.8,
        marginBottom: 6,
        textTransform: 'uppercase',
    },
    dayCard: {
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.borderLight,
        borderRadius: 14,
        overflow: 'hidden',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.borderLight,
    },
    rowLast: { borderBottomWidth: 0 },
    recurringRowLast: {},
    dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
    rowDesc: { fontFamily: 'Inter-SemiBold', fontSize: 13.5, color: theme.colors.text },
    rowMeta: { fontFamily: 'Inter-Regular', fontSize: 11.5, color: theme.colors.textTertiary, marginTop: 1 },
    rowAmount: { fontFamily: 'Inter-SemiBold', fontSize: 13.5, color: theme.colors.text, flexShrink: 0 },
    pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, marginRight: 8 },
    pillDue: { backgroundColor: theme.colors.warningSurface },
    pillActive: { backgroundColor: theme.colors.surfaceSecondary },
    pillText: { fontFamily: 'Inter-Bold', fontSize: 10.5 },
    pillTextDue: { color: theme.colors.warning },
    pillTextActive: { color: theme.colors.textTertiary },
    pillRan: { backgroundColor: theme.colors.successSurface },
    pillTextRan: { color: theme.colors.success },
    recurringAmount: { fontFamily: 'Inter-SemiBold', fontSize: 13.5, color: theme.colors.text, width: 62, textAlign: 'right' },
    recurringChevron: { color: theme.colors.textTertiary, fontSize: 12, marginLeft: 8 },
    recurringExpand: {
        backgroundColor: theme.colors.surfaceSecondary,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.borderLight,
        paddingHorizontal: 14, paddingVertical: 12,
    },
    recurringActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    recurringRanText: { fontFamily: 'Inter-SemiBold', fontSize: 12.5, color: theme.colors.success, paddingVertical: 8 },
    recurringRunBtn: {
        backgroundColor: theme.colors.primary, borderRadius: 999,
        paddingHorizontal: 14, paddingVertical: 8,
    },
    recurringRunBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 12.5, color: '#fff' },
    recurringEditBtn: {
        borderWidth: 1, borderColor: theme.colors.borderLight, backgroundColor: theme.colors.surface,
        borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
    },
    recurringEditBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 12.5, color: theme.colors.primary },
    recurringEditActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
    recurringFooter: {
        flexDirection: 'row', justifyContent: 'space-between',
        paddingHorizontal: 14, paddingVertical: 11,
        backgroundColor: theme.colors.surfaceSecondary,
    },
    recurringFooterLabel: { fontFamily: 'Inter-Regular', fontSize: 12, color: theme.colors.textTertiary },
    recurringFooterAmount: { fontFamily: 'Inter-Bold', fontSize: 12.5, color: theme.colors.text },
    emptyCard: {
        alignItems: 'center',
        paddingVertical: 40,
        marginTop: 20,
        backgroundColor: theme.colors.surface,
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.borderLight,
    },
    emptyIcon: {
        fontSize: 44,
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
    pickerLabel: {
        fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary,
        marginBottom: 6, marginLeft: 4, marginTop: 4,
    },
    rowFields: { flexDirection: 'row', gap: 12 },
    halfField: { flex: 1 },
    pickerScroll: {
        marginBottom: 12,
    },
    pickerContent: {
        gap: 8, paddingRight: 8,
    },
    pickerChip: {
        paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: 16, backgroundColor: theme.colors.surfaceSecondary,
    },
    pickerChipActive: {
        backgroundColor: theme.colors.primary,
    },
    pickerChipText: {
        fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary,
    },
    pickerChipTextActive: {
        color: '#FFFFFF',
    },
});
