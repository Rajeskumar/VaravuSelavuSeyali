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
import { View, Text, StyleSheet, Alert, TouchableOpacity, Modal, Platform, ScrollView, Pressable, KeyboardAvoidingView, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { listExpenses, deleteExpense, updateExpense, getExpenseItems, updateExpenseItems, ExpenseRecord } from '../api/expenses';
import ScannedItemsCard, { ScannedItem } from '../components/ScannedItemsCard';
import ExpenseItemsViewSheet from '../components/ExpenseItemsViewSheet';
import { listGroups, getGroupDetail, moveExpenseToGroup, listAllMyGroupExpenses, UnifiedGroupExpenseRow, GroupSummary, ApiError } from '../api/groups';
import { listRecurringTemplates, upsertRecurringTemplate, executeRecurringNow, RecurringTemplateDTO, UpsertRecurringPayload } from '../api/recurring';
import { CATEGORY_GROUPS, MAIN_CATEGORIES, findMainCategory } from '../constants/categories';
import { useAppTheme } from '../context/ThemeContext';
import { useTagsEnabled } from '../hooks/useTagsEnabled';
import { useCardCoachEnabled } from '../hooks/useCardCoachEnabled';
import CardPickerField from '../components/cards/CardPickerField';
import { AppTheme, withAlpha } from '../theme';
import CustomInput from '../components/CustomInput';
import CustomButton from '../components/CustomButton';
import TopTabs from '../components/TopTabs';
import ScreenHeader from '../components/ScreenHeader';
import IconButton from '../components/IconButton';
import SectionLabel from '../components/SectionLabel';
import ListRow from '../components/ListRow';
import ExpenseQuickSheet from '../components/ExpenseQuickSheet';
import ToggleSwitch from '../components/ToggleSwitch';
import SpendFilterChips from '../components/SpendFilterChips';
import SplitEditor, { SplitEditorValue } from '../components/SplitEditor';
import TagPickerModal from '../components/tags/TagPickerModal';
import { showToast } from '../components/Toast';
import { ListSkeleton } from '../components/SkeletonLoader';
import { formatCurrency } from '../utils/currencyMath';
import { onExpenseChanged } from '../utils/expenseEvents';
import { shortDate, ordinal, nextRecurringOccurrence } from '../utils/expenseInsights';
import { matchesSpendFilters, SpendScope } from '../utils/spendFilters';

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

/** Parses either the personal-expense "MM/DD/YYYY" format or an ISO date string into a
 * 'YYYY-MM' key, so search/month filtering can group personal and group rows consistently
 * regardless of which endpoint they came from. */
interface FeedRow {
    key: string;
    date: string;
    desc: string;
    meta: string;
    amount: number;
    category: string;
    onPress?: () => void;
    tagIds?: string[];
}

export default function ExpensesScreen() {
    const { accessToken, userEmail } = useAuth();
    const navigation = useNavigation<any>();
    const isFocused = useIsFocused();
    const { theme } = useAppTheme();
    const { enabled: tagsEnabled } = useTagsEnabled();
    // useWindowDimensions (not Dimensions.get(), and not a module-level constant) — reading
    // window size at module load time returns 0/stale on native before the bridge is ready,
    // which made the edit sheet's maxHeight resolve to 0 and rendered nothing at all.
    const { height: windowHeight } = useWindowDimensions();
    const styles = useMemo(() => createStyles(theme, windowHeight), [theme, windowHeight]);
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
    // Itemized expenses (receipt-scanned) get a line-item review/edit section, reusing the
    // same ScannedItemsCard the create flow uses. editItemsLoaded distinguishes "no items to
    // show" from "haven't fetched yet" so saveEdit knows whether to also call updateExpenseItems.
    const [editItems, setEditItems] = useState<ScannedItem[]>([]);
    const [editItemsTax, setEditItemsTax] = useState(0);
    const [editItemsDiscount, setEditItemsDiscount] = useState(0);
    const [editItemsLoaded, setEditItemsLoaded] = useState(false);
    // TS-TAG-112 — personal expenses have the tag_names write-through field, so this is sent
    // full-replace with the rest of the edit payload (no separate association calls needed).
    const [editTagNames, setEditTagNames] = useState<string[]>([]);
    const [tagPickerVisible, setTagPickerVisible] = useState(false);
    const [editCardId, setEditCardId] = useState<string | null>(null);
    const { enabled: cardCoachEnabled } = useCardCoachEnabled();
    const [tagFilterIds, setTagFilterIds] = useState<string[]>([]);
    // Design review (2026-09): neither control existed on this screen before — parity with
    // web's ExpensesPage, which added search/month filtering over the same combined feed.
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    // V2 expense detail sheet (personal rows) — replaces the old Alert action list.
    const [detailExpense, setDetailExpense] = useState<ExpenseRecord | null>(null);
    // "Skip" on the due-soon prompt is a per-session dismissal — there's no server-side snooze.
    const [dismissedDue, setDismissedDue] = useState<string[]>([]);
    // Defaults to the current month (the design's "THIS MONTH"); the chip's sheet can widen to all time.
    const [monthFilter, setMonthFilter] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const [categoryFilter, setCategoryFilter] = useState('');
    const [scopeFilter, setScopeFilter] = useState<SpendScope>('all');

    // TrackSpense v3 Mobile mock's recurring row expand/edit/run-now (`r.expanded`/`r.editing`) —
    // was previously a flat, non-interactive row.
    const [recOpenId, setRecOpenId] = useState<string | null>(null);
    const [recEdit, setRecEdit] = useState<{ id: string; description: string; category: string; day_of_month: string; default_cost: string } | null>(null);

    // Read-only itemized view for scanned personal expenses — previously the only place
    // items ever rendered was inside the editable ScannedItemsCard, one tap deeper in Edit.
    const [viewItemsExpense, setViewItemsExpense] = useState<ExpenseRecord | null>(null);

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
            const data = await listExpenses(accessToken, userEmail, currentOffset, 50, tagFilterIds);

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
    }, [isFocused, accessToken, userEmail, tagFilterIds]);

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
        setEditTagNames((expense.tags || []).map((t) => t.name));
        setEditCardId(expense.card?.id || null);
        setEditItems([]);
        setEditItemsLoaded(false);
        setEditModalVisible(true);

        const isItemized = expense.split_type === 'itemized' || (expense.item_count || 0) > 1;
        if (isItemized) {
            getExpenseItems(expense.row_id)
                .then((res) => {
                    setEditItems(res.items.map((it) => ({
                        line_no: it.line_no,
                        item_name: it.item_name,
                        line_total: it.line_total,
                        quantity: it.quantity,
                        unit_price: it.unit_price,
                        normalized_name: it.normalized_name || undefined,
                    })));
                    setEditItemsTax(res.tax);
                    setEditItemsDiscount(res.discount);
                    setEditItemsLoaded(true);
                })
                .catch(() => { /* falls back to the flat amount field only */ });
        }
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
            if (editItemsLoaded && editItems.length > 0) {
                await updateExpenseItems(editingExpense.row_id, {
                    items: editItems.map((it) => ({
                        line_no: it.line_no,
                        item_name: it.item_name,
                        normalized_name: it.normalized_name,
                        quantity: it.quantity,
                        unit_price: it.unit_price,
                        line_total: it.line_total,
                    })),
                    amount: parseFloat(editAmount) || 0,
                    tax: editItemsTax,
                    discount: editItemsDiscount,
                });
            }
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
                    tag_names: tagsEnabled ? editTagNames : undefined,
                    card_id: cardCoachEnabled ? editCardId : undefined,
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

    // ── Combined feed rows (personal + group expenses), mirrors the mock's `expDays` before
    // day-grouping. Kept separate from `dayGroups` below so `availableMonths` can be derived
    // from the full, unfiltered set (the month picker's options shouldn't shrink to match
    // whatever's currently filtered). ──
    const allFeedRows = useMemo(() => {
        const personalRows: FeedRow[] = expenses.map((e) => ({
            key: `p-${e.row_id}`,
            date: e.date,
            desc: e.description,
            meta: (e.tags || []).length > 0
                ? `${shortDate(e.date)} · ${e.category} · ${e.tags!.map((t) => t.name).join(', ')}`
                : `${shortDate(e.date)} · ${e.category}`,
            amount: e.cost,
            category: e.category,
            onPress: () => setDetailExpense(e),
            tagIds: (e.tags || []).map((t) => t.id),
        }));
        // TS-TAG-112 — personal rows are already server-filtered by tagFilterIds (GET /expenses
        // supports tag_ids). Group rows have no such backend support (no tag_ids param on the
        // per-group expenses list), so they're filtered client-side here after the fact.
        const groupRowsAll: FeedRow[] = (groupExpenses || []).map((e: UnifiedGroupExpenseRow) => ({
            key: `g-${e.row_id}`,
            date: e.date,
            desc: e.description,
            meta: (e.tags || []).length > 0
                ? `${shortDate(e.date)} · ${e.group_name} · your share · ${e.tags!.map((t) => t.name).join(', ')}`
                : `${shortDate(e.date)} · ${e.group_name} · your share`,
            amount: e.my_share,
            category: e.category,
            onPress: () => navigation.navigate('GroupDetail', { groupId: e.group_id }),
            tagIds: (e.tags || []).map((t) => t.id),
        }));
        const groupRows = tagFilterIds.length > 0
            ? groupRowsAll.filter((r) => (r.tagIds || []).some((id) => tagFilterIds.includes(id)))
            : groupRowsAll;
        return [...personalRows, ...groupRows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [expenses, groupExpenses, tagFilterIds]);

    const visibleRows = useMemo(
        () => allFeedRows.filter((r) => matchesSpendFilters(r, { month: monthFilter, category: categoryFilter, scope: scopeFilter, query: searchQuery })),
        [allFeedRows, searchQuery, monthFilter, categoryFilter, scopeFilter],
    );
    const visibleTotal = useMemo(() => visibleRows.reduce((sum, r) => sum + r.amount, 0), [visibleRows]);
    const currentMonthKey = useMemo(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }, []);
    const subtotalLabel = !monthFilter
        ? 'All time'
        : monthFilter === currentMonthKey
            ? 'This month'
            : new Date(Number(monthFilter.slice(0, 4)), Number(monthFilter.slice(5)) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

    // ── Recurring tab: simple day-of-month heuristic for due/active, matching the mock's pill. ──
    const recurringRows = useMemo(() => {
        const todayDay = new Date().getDate();
        return (recurringTemplates || []).map((t: RecurringTemplateDTO) => ({
            ...t,
            isDue: t.day_of_month < todayDay,
        }));
    }, [recurringTemplates]);
    // Nearest active template landing within a week that hasn't already run today — drives the
    // cyan "Due in N days" prompt at the top of the Recurring tab.
    const dueSoon = useMemo(() => {
        const today = new Date();
        return (recurringTemplates || [])
            .filter((t) => t.status !== 'Paused' && !ranToday(t) && !dismissedDue.includes(t.id))
            .map((t) => ({ t, ...nextRecurringOccurrence(t.day_of_month, today) }))
            .filter((x) => x.daysUntil <= 7)
            .sort((a, b) => a.daysUntil - b.daysUntil)[0] ?? null;
    }, [recurringTemplates, dismissedDue]);

    const toggleTemplateMut = useMutation({
        mutationFn: (t: RecurringTemplateDTO) => upsertRecurringTemplate({
            description: t.description,
            category: t.category,
            day_of_month: t.day_of_month,
            default_cost: t.default_cost,
            start_date_iso: t.start_date_iso,
            status: t.status === 'Paused' ? 'Active' : 'Paused',
            merchant_name: t.merchant_name,
            group_id: t.group_id,
            split_config: t.split_config,
        }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['recurringTemplates'] }),
        onError: () => showToast({ message: 'Failed to update template', type: 'error' }),
    });

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
            merchant_name: t.merchant_name,
            group_id: t.group_id,
            split_config: t.split_config,
        });
    };

    return (
        <LinearGradient colors={theme.gradients.surface} style={styles.container}>
            <View style={styles.gutter}>
                <ScreenHeader
                    title="Expenses"
                    right={tab === 'transactions' ? (
                        <IconButton
                            icon={showSearch ? 'close' : 'search'}
                            accessibilityLabel={showSearch ? 'Close search' : 'Search expenses'}
                            onPress={() => { setShowSearch((v) => !v); if (showSearch) setSearchQuery(''); }}
                        />
                    ) : undefined}
                />
                <TopTabs<Tab>
                    value={tab}
                    onChange={setTab}
                    options={[
                        { value: 'transactions', label: 'Transactions' },
                        { value: 'recurring', label: 'Recurring' },
                    ]}
                />
            </View>

            {tab === 'transactions' && (
                <View style={[styles.gutter, { paddingTop: 14 }]}>
                    {showSearch && (
                        <CustomInput
                            icon="🔍"
                            placeholder="Search expenses"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoFocus
                            style={{ minHeight: 0, paddingVertical: 0 }}
                        />
                    )}
                    <SpendFilterChips
                        month={monthFilter}
                        onMonth={setMonthFilter}
                        category={categoryFilter}
                        onCategory={setCategoryFilter}
                        tagIds={tagFilterIds}
                        onTagIds={setTagFilterIds}
                        scope={scopeFilter}
                        onScope={setScopeFilter}
                        tagsEnabled={tagsEnabled}
                        showScope={(groupExpenses || []).length > 0}
                    />
                    <View style={styles.subtotal}>
                        <SectionLabel>{subtotalLabel}</SectionLabel>
                        <Text style={styles.subtotalAmount}>{formatCurrency(visibleTotal)}</Text>
                    </View>
                </View>
            )}

            <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.gutter, { paddingBottom: 140 }]} showsVerticalScrollIndicator={false}>
                {tab === 'transactions' ? (
                    loading && expenses.length === 0 ? (
                        <ListSkeleton count={5} />
                    ) : visibleRows.length === 0 ? (
                        <View style={styles.emptyCard}>
                            <Text style={styles.emptyTitle}>
                                {searchQuery.trim() || categoryFilter || scopeFilter !== 'all' || tagFilterIds.length > 0 || monthFilter ? 'No matches' : 'No expenses yet'}
                            </Text>
                            <Text style={styles.emptySubtitle}>
                                {searchQuery.trim() || monthFilter || tagFilterIds.length > 0
                                    ? 'Try a different search, month, or tag.'
                                    : 'Start tracking your spending'}
                            </Text>
                        </View>
                    ) : (
                        visibleRows.map((row) => (
                            <ListRow
                                key={row.key}
                                category={row.category}
                                title={row.desc}
                                meta={row.meta}
                                amount={formatCurrency(row.amount)}
                                onPress={row.onPress}
                            />
                        ))
                    )
                ) : loadingRecurring ? (
                    <ListSkeleton count={4} />
                ) : recurringRows.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyTitle}>No recurring expenses</Text>
                        <Text style={styles.emptySubtitle}>Templates you set up will appear here</Text>
                    </View>
                ) : (
                    <>
                        {dueSoon && (
                            <View style={styles.dueCard}>
                                <SectionLabel color={theme.colors.secondary}>
                                    {dueSoon.daysUntil === 0 ? 'Due today' : `Due in ${dueSoon.daysUntil} day${dueSoon.daysUntil === 1 ? '' : 's'}`}
                                </SectionLabel>
                                <Text style={styles.dueText}>
                                    {dueSoon.t.description} · {formatCurrency(dueSoon.t.default_cost)} on {dueSoon.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </Text>
                                <View style={styles.dueActions}>
                                    <TouchableOpacity
                                        style={styles.dueConfirm}
                                        activeOpacity={0.8}
                                        disabled={runRecurringMut.isPending}
                                        onPress={() => runRecurringMut.mutate(dueSoon.t.id)}
                                    >
                                        <Text style={styles.dueConfirmText}>{runRecurringMut.isPending ? 'Logging…' : 'Confirm now'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.dueSkip}
                                        activeOpacity={0.7}
                                        onPress={() => setDismissedDue((d) => [...d, dueSoon.t.id])}
                                    >
                                        <Text style={styles.dueSkipText}>Skip</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                        {recurringRows.map((r) => {
                            const expanded = recOpenId === r.id;
                            const editing = expanded && recEdit?.id === r.id;
                            const ran = ranToday(r);
                            const paused = r.status === 'Paused';
                            return (
                                <View key={r.id}>
                                    <ListRow
                                        leading={<View />}
                                        title={r.description}
                                        meta={`Monthly on the ${ordinal(r.day_of_month)} · ${r.category}${ran ? ' · logged today' : ''}`}
                                        onPress={() => { setRecOpenId(expanded ? null : r.id); setRecEdit(null); }}
                                        style={styles.recRow}
                                        trailing={(
                                            <View style={styles.recTrailing}>
                                                <Text style={styles.recurringAmount}>{formatCurrency(r.default_cost)}</Text>
                                                <ToggleSwitch
                                                    value={!paused}
                                                    onValueChange={() => toggleTemplateMut.mutate(r)}
                                                    accessibilityLabel={`${r.description} ${paused ? 'paused' : 'active'}`}
                                                />
                                            </View>
                                        )}
                                    />

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
                    </>
                )}
            </ScrollView>

            <ExpenseQuickSheet
                expense={detailExpense}
                allExpenses={expenses}
                onClose={() => setDetailExpense(null)}
                onEdit={handleEdit}
                onViewItems={setViewItemsExpense}
                onMove={groupsEnabled ? openMoveModal : undefined}
                onDelete={(e) => handleDelete(e.row_id)}
            />

            {/* Edit Modal — bottom sheet, standardized with the group expense edit/view sheets */}
            <Modal visible={editModalVisible} animationType="slide" transparent onRequestClose={() => setEditModalVisible(false)}>
                <Pressable style={styles.editSheetBackdrop} onPress={() => setEditModalVisible(false)}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                        <Pressable style={styles.editSheetContent} onPress={(e) => e.stopPropagation()}>
                            <View style={styles.editSheetPill} />
                            <View style={styles.editSheetHeader}>
                                <Text style={styles.editSheetTitle}>Edit Transaction</Text>
                                <TouchableOpacity
                                    style={styles.editSheetCloseBtn}
                                    onPress={() => setEditModalVisible(false)}
                                    hitSlop={8}
                                >
                                    <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
                                </TouchableOpacity>
                            </View>
                            {/* No `style={{ flex: 1 }}` here on purpose: editSheetContent's own height
                                is auto/content-based (only capped by maxHeight, not a definite flex
                                height), so a flexBasis:0 flexGrow:1 child can't resolve against it and
                                collapses to 0 — that's what was rendering only the header. Letting the
                                ScrollView size to its own content (bounded by the parent's maxHeight +
                                flexShrink:1) matches the working CategoryPickerField/AddExpenseScreen sheets. */}
                            <ScrollView
                                contentContainerStyle={styles.editSheetScrollContent}
                                showsVerticalScrollIndicator={false}
                            >

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

                        {editItemsLoaded && editItems.length > 0 && (
                            <ScannedItemsCard
                                theme={theme}
                                items={editItems}
                                onChange={setEditItems}
                                merchant={editMerchantName}
                                tax={editItemsTax}
                                discount={editItemsDiscount}
                                currentAmount={parseFloat(editAmount) || 0}
                            />
                        )}

                        {tagsEnabled && (
                            <View style={{ marginTop: 12 }}>
                                <Text style={styles.pickerLabel}>🏷️  Tags</Text>
                                <TouchableOpacity onPress={() => setTagPickerVisible(true)}>
                                    <Text style={[styles.pickerChipText, { color: theme.colors.primary, paddingVertical: 6 }]}>
                                        {editTagNames.length > 0 ? editTagNames.join(', ') : '+ Add tag'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        <CardPickerField value={editCardId} onChange={setEditCardId} />

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
                        {groupsEnabled && (
                            <CustomButton
                                title="Move to Group…"
                                variant="outline"
                                onPress={() => {
                                    setEditModalVisible(false);
                                    if (editingExpense) openMoveModal(editingExpense);
                                }}
                                style={{ marginTop: 10 }}
                            />
                        )}
                            </ScrollView>
                        </Pressable>
                    </KeyboardAvoidingView>
                </Pressable>
            </Modal>

            <TagPickerModal
                visible={tagPickerVisible}
                value={editTagNames}
                onChange={setEditTagNames}
                onClose={() => setTagPickerVisible(false)}
            />

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

            <ExpenseItemsViewSheet
                visible={!!viewItemsExpense}
                expense={viewItemsExpense}
                onClose={() => setViewItemsExpense(null)}
            />
        </LinearGradient>
    );
}

const createStyles = (theme: AppTheme, windowHeight: number) => StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: Platform.OS === 'android' ? 50 : 56,
    },
    gutter: { paddingHorizontal: 22 },
    subtotal: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 4, paddingBottom: 6 },
    subtotalAmount: { fontFamily: 'InstrumentSans-Bold', fontSize: 15, color: theme.colors.text, fontVariant: ['tabular-nums'] },
    dueCard: {
        borderWidth: 1, borderColor: withAlpha(theme.colors.secondary, 0.25), backgroundColor: withAlpha(theme.colors.secondary, 0.07),
        borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, marginTop: 16, marginBottom: 6,
    },
    dueText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 15, lineHeight: 21, color: theme.colors.text, marginTop: 6 },
    dueActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
    dueConfirm: { height: 34, paddingHorizontal: 14, borderRadius: 11, backgroundColor: theme.colors.gradientEnd, justifyContent: 'center' },
    dueConfirmText: { fontFamily: 'InstrumentSans-Bold', fontSize: 13, color: '#05060A' },
    dueSkip: { height: 34, paddingHorizontal: 14, borderRadius: 11, borderWidth: 1, borderColor: theme.colors.border, justifyContent: 'center' },
    dueSkipText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 13, color: theme.colors.textSecondary },
    recRow: { paddingVertical: 10, gap: 0 },
    recTrailing: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    recurringAmount: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 15, color: theme.colors.text, fontVariant: ['tabular-nums'] },
    recurringExpand: {
        backgroundColor: theme.colors.surfaceSecondary,
        borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 12, marginVertical: 8,
    },
    recurringActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    recurringRanText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 12.5, color: theme.colors.success, paddingVertical: 8 },
    recurringRunBtn: {
        backgroundColor: theme.colors.primary, borderRadius: 999,
        paddingHorizontal: 14, paddingVertical: 8,
    },
    recurringRunBtnText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 12.5, color: theme.colors.textInverse },
    recurringEditBtn: {
        borderWidth: 1, borderColor: theme.colors.borderLight, backgroundColor: theme.colors.surface,
        borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
    },
    recurringEditBtnText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 12.5, color: theme.colors.primary },
    recurringEditActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
    emptyCard: { alignItems: 'center', paddingVertical: 48 },
    emptyTitle: { fontSize: 17, fontWeight: '600', color: theme.colors.text, marginBottom: 4 },
    emptySubtitle: { fontSize: 14, color: theme.colors.textSecondary },
    modalOverlay: {
        flex: 1,
        backgroundColor: theme.colors.overlay,
        justifyContent: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: theme.colors.surfaceElevated,
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
    // Edit-expense bottom sheet — standardized presentation (matches the group expense sheets):
    // slides up from the bottom, rounded top corners, drag pill, explicit close affordance.
    // Deliberately separate from modalOverlay/modalContent (which the "Move to Group" modal
    // below still uses as a centered popup) so this restyle can't affect that sibling modal.
    editSheetBackdrop: {
        flex: 1,
        backgroundColor: theme.colors.overlay,
        justifyContent: 'flex-end',
    },
    editSheetContent: {
        backgroundColor: theme.colors.surfaceElevated,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 24,
        paddingTop: 12,
        maxHeight: windowHeight * 0.92,
        flexShrink: 1,
        ...theme.shadows.lg,
    },
    editSheetScrollContent: {
        paddingBottom: 28,
    },
    editSheetPill: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: theme.colors.borderLight,
        alignSelf: 'center',
        marginBottom: 16,
    },
    editSheetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    editSheetTitle: {
        fontFamily: theme.typography.fontFamily.bold,
        fontSize: 20,
        color: theme.colors.text,
    },
    editSheetCloseBtn: {
        padding: 4,
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
        color: theme.colors.textInverse,
    },
});
