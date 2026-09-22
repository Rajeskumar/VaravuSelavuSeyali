/**
 * AnalysisScreen.tsx — V2 "Insights" tab (Flows 6.1). Overview · Items · Merchants · Budgets under a
 * month chip. Overview is the category donut with its legend, then "what changed vs last month",
 * each row linking to the item or merchant behind it. Items and Merchants are ranked lists that open
 * the detail screens; Budgets hosts BudgetsTabContent (left-to-spend hero + per-category bars).
 *
 * Everything the design doesn't show above the fold — the group/tag scope pickers and the "include
 * group shares" switch — sits in a "Scope" block at the bottom of Overview rather than in front of
 * the chart. Card Coach lives under Account → Cards & accounts (as in the design), not as a tab.
 */
import React, { useState, useMemo } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { getAnalysis } from '../api/analysis';
import { getChangeInsights, ChangeInsight, getTopItems, getTopMerchants, ItemInsightSummary, MerchantInsightSummary } from '../api/analytics';
import { checkGroupsEnabled, listGroups } from '../api/groups';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import ScreenWrapper from '../components/ScreenWrapper';
import ScreenHeader from '../components/ScreenHeader';
import CustomButton from '../components/CustomButton';
import TopTabs from '../components/TopTabs';
import SectionLabel from '../components/SectionLabel';
import SegmentDonut from '../components/SegmentDonut';
import MonthChip from '../components/MonthChip';
import ToggleSwitch from '../components/ToggleSwitch';
import SimpleSelect from '../components/SimpleSelect';
import { HeroSkeleton, ListSkeleton } from '../components/SkeletonLoader';
import { onExpenseChanged } from '../utils/expenseEvents';
import { splitTopSegments } from '../utils/segments';
import { changeRow, DONUT_COLORS, DONUT_OTHERS, ChangeTone } from '../utils/insightsFormat';
import { AddExpenseContext } from './AddExpenseScreen';
import { useBudgetsEnabled } from '../hooks/useBudgetsEnabled';
import BudgetsTabContent from '../components/BudgetsTabContent';
import { useTagsEnabled } from '../hooks/useTagsEnabled';
import TagFilterBar from '../components/tags/TagFilterBar';

type AnalysisTab = 'overview' | 'items' | 'merchants' | 'budgets';

const formatCurrency = (amount: number) => `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;

export default function AnalysisScreen() {
    const { accessToken, userEmail } = useAuth();
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const qc = useQueryClient();
    const navigation = useNavigation<any>();
    const { openAddExpense } = React.useContext(AddExpenseContext);
    const route = useRoute<any>();

    const { enabled: budgetsEnabled } = useBudgetsEnabled();
    const { enabled: tagsEnabled } = useTagsEnabled();
    const [tagFilterIds, setTagFilterIds] = useState<string[]>([]);
    const [tab, setTab] = useState<AnalysisTab>('overview');

    // Deep links into a sub-tab (Account → Budgets, Ask hand-offs): `{ initialTab }`.
    React.useEffect(() => {
        const t = route.params?.initialTab;
        if (t === 'budgets' && budgetsEnabled) setTab('budgets');
        else if (t === 'items' || t === 'merchants') setTab(t);
        else if (t === 'cards') navigation.navigate('Cards');
    }, [route.params?.initialTab, budgetsEnabled, navigation]);

    const [includeGroups, setIncludeGroups] = useState(true);
    // One group's whole spend, analysed like the personal view. '' = the user's own spending.
    const [groupId, setGroupId] = useState('');
    const scope = groupId ? 'group' : includeGroups ? 'combined' : 'personal';
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [showAllCategories, setShowAllCategories] = useState(false);

    const today = useMemo(() => new Date(), []);
    const [period, setPeriod] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
    const { year, month } = period;

    const { data: groupsEnabled } = useQuery({ queryKey: ['groupsEnabled'], queryFn: checkGroupsEnabled });
    const { data: groups = [] } = useQuery({
        queryKey: ['groups', false],
        queryFn: () => listGroups(false),
        enabled: !!groupsEnabled,
    });
    const selectedGroup = groups.find((g) => g.group_id === groupId);

    const { data, isLoading: loadingAnalysis } = useQuery({
        queryKey: ['analysis', userEmail, year, month, scope, groupId || null, tagFilterIds],
        queryFn: () => getAnalysis(accessToken!, userEmail!, { year, month, scope, group_id: groupId || undefined, tag_ids: tagFilterIds.length ? tagFilterIds : undefined }),
        enabled: !!accessToken && !!userEmail,
    });

    const { data: insightsData, isLoading: loadingInsights } = useQuery({
        queryKey: ['insights', userEmail, year, month],
        queryFn: () => getChangeInsights(userEmail!, { year, month }).catch(() => []),
        enabled: !!accessToken && !!userEmail,
    });

    const { data: topItemsData, isLoading: loadingItems } = useQuery({
        queryKey: ['topItems', userEmail, year, month],
        queryFn: () => getTopItems(userEmail!, { year, month }),
        enabled: !!accessToken && !!userEmail && tab === 'items',
    });

    const { data: topMerchantsData, isLoading: loadingMerchants } = useQuery({
        queryKey: ['topMerchants', userEmail, year, month],
        queryFn: () => getTopMerchants(userEmail!, { year, month }),
        enabled: !!accessToken && !!userEmail && tab === 'merchants',
    });

    React.useEffect(() => {
        return onExpenseChanged(() => {
            qc.invalidateQueries({ queryKey: ['analysis'] });
            qc.invalidateQueries({ queryKey: ['insights'] });
        });
    }, [qc]);

    const loading = loadingAnalysis || loadingInsights;
    const insights: ChangeInsight[] = insightsData || [];
    const isEmpty = data?.total_expenses === 0 && (data?.category_totals.length ?? 0) === 0;

    const prevMonthLabel = new Date(year, month - 2, 1).toLocaleString('default', { month: 'long' });
    const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });

    const total = data?.total_expenses || 0;
    const segments = useMemo(() => {
        const cats = data?.category_totals || [];
        return cats.map((c) => ({ ...c, pct: total > 0 ? (c.total / total) * 100 : 0 }));
    }, [data, total]);
    const { top, rest, restPct } = useMemo(() => splitTopSegments(segments, 5), [segments]);
    const colorFor = (i: number) => (i < DONUT_COLORS.length ? DONUT_COLORS[i] : DONUT_OTHERS);
    const donutSeries = useMemo(() => [
        ...top.map((s, i) => ({ key: s.category, pct: s.pct, color: colorFor(i) })),
        ...(rest.length > 0 ? [{ key: '__others', pct: restPct, color: DONUT_OTHERS }] : []),
    ], [top, rest, restPct]);

    const items: ItemInsightSummary[] = topItemsData || [];
    const merchants: MerchantInsightSummary[] = topMerchantsData || [];
    const topMerchantSpend = merchants[0]?.total_spent || 0;

    const toneColor = (t: ChangeTone) =>
        t === 'error' ? theme.colors.error : t === 'warning' ? theme.colors.warning : t === 'success' ? theme.colors.success : theme.colors.secondary;

    const openLink = (link: { kind: 'item' | 'merchant'; name: string }) =>
        navigation.navigate(link.kind === 'item' ? 'ItemDetail' : 'MerchantDetail', link.kind === 'item' ? { itemName: link.name } : { merchantName: link.name });

    return (
        <ScreenWrapper contentStyle={{ paddingHorizontal: 0 }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
                <ScreenHeader
                    title="Insights"
                    style={{ paddingHorizontal: 22 }}
                    right={<MonthChip value={monthKey(year, month)} onChange={(_v, y, m) => { setPeriod({ year: y, month: m }); setSelectedCategory(null); }} />}
                />

                <View style={styles.tabsRow}>
                    <TopTabs<AnalysisTab>
                        value={tab}
                        onChange={(t) => { setTab(t); setSelectedCategory(null); }}
                        options={[
                            { value: 'overview', label: 'Overview' },
                            { value: 'items', label: 'Items' },
                            { value: 'merchants', label: 'Merchants' },
                            ...(budgetsEnabled ? [{ value: 'budgets' as const, label: 'Budgets' }] : []),
                        ]}
                    />
                </View>

                {tab === 'overview' && (
                    loading ? (
                        <>
                            <HeroSkeleton />
                            <ListSkeleton count={3} />
                        </>
                    ) : isEmpty ? (
                        <View style={styles.empty}>
                            <Text style={styles.emptyTitle}>No expenses in {monthName} yet</Text>
                            <Text style={styles.emptySubtitle}>Add an expense to see category breakdowns and trends.</Text>
                            <CustomButton title="Add an Expense" onPress={() => openAddExpense()} fullWidth={false} style={{ marginTop: 12 }} />
                        </View>
                    ) : selectedCategory ? (
                        (() => {
                            const idx = segments.findIndex((s) => s.category === selectedCategory);
                            const catSegment = segments[idx];
                            const catTxns = data?.category_expense_details?.[selectedCategory] ?? [];
                            return (
                                <View style={styles.pad}>
                                    <TouchableOpacity onPress={() => setSelectedCategory(null)} activeOpacity={0.6} style={styles.backLink}>
                                        <Ionicons name="arrow-back" size={14} color={theme.colors.primary} />
                                        <Text style={styles.backText}>Categories</Text>
                                    </TouchableOpacity>
                                    <View style={styles.catHead}>
                                        <View style={[styles.legendDot, { backgroundColor: idx >= 0 ? colorFor(idx) : theme.colors.textTertiary }]} />
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Text style={styles.catName} numberOfLines={1}>{selectedCategory}</Text>
                                            <Text style={styles.meta}>
                                                {catTxns.length} transaction{catTxns.length === 1 ? '' : 's'} · {(catSegment?.pct ?? 0).toFixed(0)}% of {monthName}
                                            </Text>
                                        </View>
                                        <Text style={styles.catTotal}>{formatCurrency(catSegment?.total ?? 0)}</Text>
                                    </View>
                                    {catTxns.length === 0 ? (
                                        <Text style={styles.emptySubtitle}>No transactions found.</Text>
                                    ) : catTxns.map((t, i) => (
                                        <View key={`${t.date}-${i}`} style={styles.row}>
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <Text style={styles.rowTitle} numberOfLines={1}>{t.description}</Text>
                                                <Text style={styles.meta} numberOfLines={1}>{t.date}</Text>
                                            </View>
                                            <Text style={styles.amount}>{formatCurrency(t.cost)}</Text>
                                        </View>
                                    ))}
                                </View>
                            );
                        })()
                    ) : (
                        <>
                            {/* Donut + legend — straight under the tabs, as designed. */}
                            <View style={styles.donutBlock}>
                                <SegmentDonut segments={donutSeries} centerValue={`$${Math.round(total).toLocaleString('en-US')}`} />
                                <View style={styles.legend}>
                                    {(showAllCategories ? segments : top).map((s, i) => (
                                        <TouchableOpacity key={s.category} style={styles.legendItem} onPress={() => setSelectedCategory(s.category)} activeOpacity={0.6}>
                                            <View style={[styles.legendDot, { backgroundColor: colorFor(i) }]} />
                                            <Text style={styles.legendText} numberOfLines={1}>{s.category}</Text>
                                            <Text style={styles.legendPct}>{s.pct.toFixed(0)}%</Text>
                                        </TouchableOpacity>
                                    ))}
                                    {rest.length > 0 && (
                                        <TouchableOpacity style={styles.legendItem} onPress={() => setShowAllCategories((v) => !v)} activeOpacity={0.6}>
                                            <View style={[styles.legendDot, { backgroundColor: DONUT_OTHERS }]} />
                                            <Text style={styles.legendText}>{showAllCategories ? 'Show fewer' : 'Others'}</Text>
                                            {!showAllCategories && <Text style={styles.legendPct}>{restPct.toFixed(0)}%</Text>}
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>

                            {groupId ? (
                                <View style={styles.pad}>
                                    <SectionLabel style={styles.labelPad}>{selectedGroup?.name ?? 'Group'}</SectionLabel>
                                    <Text style={styles.emptySubtitle}>
                                        Everything this group spent, across all members — not just your share. Switch Scope back to “My spending” for change insights.
                                    </Text>
                                </View>
                            ) : insights.length > 0 && (
                                <View style={styles.pad}>
                                    <SectionLabel style={styles.labelPad}>What changed vs {prevMonthLabel}</SectionLabel>
                                    {insights.slice(0, 5).map((c, i) => {
                                        const r = changeRow(c, prevMonthLabel);
                                        const body = (
                                            <>
                                                <View style={{ flex: 1, minWidth: 0 }}>
                                                    <Text style={styles.changeTitle} numberOfLines={2}>{r.title}</Text>
                                                    {!!r.meta && <Text style={styles.meta} numberOfLines={1}>{r.meta}</Text>}
                                                </View>
                                                <Text style={[styles.delta, { color: toneColor(r.tone) }]}>{r.delta}</Text>
                                            </>
                                        );
                                        return r.link ? (
                                            <TouchableOpacity key={`${c.metric_name}-${i}`} style={styles.row} activeOpacity={0.6} onPress={() => openLink(r.link!)}>{body}</TouchableOpacity>
                                        ) : (
                                            <View key={`${c.metric_name}-${i}`} style={styles.row}>{body}</View>
                                        );
                                    })}
                                </View>
                            )}

                            {/* Secondary controls live below the fold. */}
                            {((groupsEnabled && groups.length > 0) || (tagsEnabled && !groupId)) && (
                                <View style={[styles.pad, { marginTop: 22 }]}>
                                    <SectionLabel style={styles.labelPad}>Scope</SectionLabel>
                                    {groupsEnabled && groups.length > 0 && (
                                        <SimpleSelect
                                            label="Analyse"
                                            value={groupId}
                                            onChange={(v) => {
                                                setGroupId(v);
                                                // Tags are private to whoever applied them, so they mean nothing against a
                                                // group-wide total — clear the filter or it would silently keep narrowing it.
                                                if (v) setTagFilterIds([]);
                                            }}
                                            options={[{ label: 'My spending', value: '' }, ...groups.map((g) => ({ label: `${g.name} (whole group)`, value: g.group_id }))]}
                                        />
                                    )}
                                    {tagsEnabled && !groupId && <TagFilterBar value={tagFilterIds} onChange={setTagFilterIds} />}
                                    {!groupId && groupsEnabled && (
                                        <View style={styles.toggleRow}>
                                            <Text style={styles.toggleLabel}>Include group shares</Text>
                                            <ToggleSwitch value={includeGroups} onValueChange={setIncludeGroups} accessibilityLabel="Include group shares" />
                                        </View>
                                    )}
                                </View>
                            )}
                        </>
                    )
                )}

                {tab === 'items' && (
                    <View style={styles.pad}>
                        {loadingItems ? (
                            <ListSkeleton count={4} />
                        ) : items.length === 0 ? (
                            <View style={styles.empty}>
                                <Text style={styles.emptyTitle}>No item data yet</Text>
                                <Text style={styles.emptySubtitle}>Scan a receipt to unlock item-level insights.</Text>
                            </View>
                        ) : items.map((it) => (
                            <TouchableOpacity key={it.item_name} style={styles.row} activeOpacity={0.6} onPress={() => navigation.navigate('ItemDetail', { itemName: it.item_name })}>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={styles.rowTitle} numberOfLines={1}>{it.normalized_name || it.item_name}</Text>
                                    <Text style={styles.meta} numberOfLines={1}>
                                        {it.transaction_count} purchase{it.transaction_count === 1 ? '' : 's'}{it.distinct_merchants_count ? ` · ${it.distinct_merchants_count} merchant${it.distinct_merchants_count === 1 ? '' : 's'}` : ''}
                                    </Text>
                                </View>
                                <Text style={styles.amount}>{formatCurrency(it.total_spent)}</Text>
                                <Ionicons name="chevron-forward" size={16} color={theme.colors.textQuaternary} />
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {tab === 'merchants' && (
                    <View style={styles.pad}>
                        {loadingMerchants ? (
                            <ListSkeleton count={4} />
                        ) : merchants.length === 0 ? (
                            <View style={styles.empty}>
                                <Text style={styles.emptyTitle}>No merchant data yet</Text>
                                <Text style={styles.emptySubtitle}>Add merchant names to your expenses to unlock this.</Text>
                            </View>
                        ) : merchants.map((m) => {
                            const pct = topMerchantSpend > 0 ? (m.total_spent / topMerchantSpend) * 100 : 0;
                            return (
                                <TouchableOpacity key={m.merchant_name} style={styles.merchantRow} activeOpacity={0.6} onPress={() => navigation.navigate('MerchantDetail', { merchantName: m.merchant_name })}>
                                    <View style={styles.merchantTop}>
                                        <Text style={styles.rowTitle} numberOfLines={1}>{m.merchant_name}</Text>
                                        <Text style={styles.amount}>{formatCurrency(m.total_spent)}</Text>
                                        <Ionicons name="chevron-forward" size={16} color={theme.colors.textQuaternary} />
                                    </View>
                                    <View style={styles.merchantBarRow}>
                                        <View style={styles.track}>
                                            <View style={{ width: `${pct}%`, height: '100%', backgroundColor: theme.colors.primary }} />
                                        </View>
                                        <Text style={styles.meta}>{m.transaction_count} visit{m.transaction_count === 1 ? '' : 's'}</Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}

                {tab === 'budgets' && budgetsEnabled && <BudgetsTabContent period={monthKey(year, month)} />}
            </ScrollView>
        </ScreenWrapper>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    tabsRow: { paddingHorizontal: 22 },
    pad: { paddingHorizontal: 22 },
    labelPad: { paddingTop: 18, paddingBottom: 4 },
    donutBlock: {
        flexDirection: 'row', alignItems: 'center', gap: 20, marginHorizontal: 22, paddingTop: 20, paddingBottom: 18,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight,
    },
    legend: { flex: 1, gap: 9 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    legendDot: { width: 7, height: 7, borderRadius: 2 },
    legendText: { flex: 1, fontFamily: 'InstrumentSans-Medium', fontSize: 13, color: theme.colors.textSecondary },
    legendPct: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 13, color: theme.colors.text, fontVariant: ['tabular-nums'] },
    row: {
        flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight,
    },
    rowTitle: { flex: 1, fontFamily: 'InstrumentSans-SemiBold', fontSize: 15, color: theme.colors.text },
    changeTitle: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 14.5, lineHeight: 19, color: theme.colors.text },
    meta: { fontFamily: 'InstrumentSans-Regular', fontSize: 12, color: theme.colors.textTertiary, marginTop: 3 },
    delta: { fontFamily: 'InstrumentSans-Bold', fontSize: 14, fontVariant: ['tabular-nums'] },
    amount: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 15, color: theme.colors.text, fontVariant: ['tabular-nums'] },
    merchantRow: { paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight },
    merchantTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    merchantBarRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
    track: { flex: 1, height: 5, borderRadius: 999, backgroundColor: theme.colors.surfaceSecondary, overflow: 'hidden' },
    backLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 16, paddingBottom: 4, alignSelf: 'flex-start' },
    backText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 13.5, color: theme.colors.primary },
    catHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight },
    catName: { fontFamily: 'InstrumentSans-Bold', fontSize: 16, color: theme.colors.text },
    catTotal: { fontFamily: 'BricolageGrotesque-SemiBold', fontSize: 22, color: theme.colors.text, fontVariant: ['tabular-nums'] },
    toggleRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight,
    },
    toggleLabel: { fontFamily: 'InstrumentSans-Medium', fontSize: 15, color: theme.colors.text },
    empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
    emptyTitle: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 17, color: theme.colors.text, marginBottom: 4, textAlign: 'center' },
    emptySubtitle: { fontFamily: 'InstrumentSans-Regular', fontSize: 13.5, lineHeight: 19, color: theme.colors.textTertiary, textAlign: 'center' },
});
