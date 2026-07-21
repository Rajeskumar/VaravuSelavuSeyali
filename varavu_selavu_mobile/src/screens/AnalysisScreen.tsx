/**
 * AnalysisScreen.tsx — TrackSpense v3 Mobile mock's "Analysis" tab (`isAnalysis` block):
 * Overview/Items/Merchants segmented tabs, all three rendered in place (switching `tab` state
 * only — no navigation away). Overview is a "WHERE IT WENT" stacked color bar + legend +
 * "Include group shares" toggle, a "WHAT CHANGED vs last month" list, and a one-line insight
 * callout. Items/Merchants are simple ranked lists (name/meta + amount, matching the mock's
 * illustrative copy) fetched directly from the existing `getTopItems`/`getTopMerchants` APIs —
 * an earlier pass had these two tabs `navigation.navigate()` away to the separate dedicated
 * ItemInsightsScreen/MerchantInsightsScreen, which meant the tab never visually showed as
 * selected and the toggle read as broken/missing; this embeds real content instead.
 *
 * Previously this screen had a Month/Year period toggle, a TrendNavigator month-bar strip, an
 * InsightRail, a standalone total card, and a CategoryRankedList — none of that matches the
 * mock; replaced with the structure above.
 */
import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Switch,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getAnalysis } from '../api/analysis';
import { getChangeInsights, ChangeInsight, getTopItems, getTopMerchants, ItemInsightSummary, MerchantInsightSummary } from '../api/analytics';
import { checkGroupsEnabled } from '../api/groups';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { categoryPalette } from '../utils/chartTheme';
import ScreenWrapper from '../components/ScreenWrapper';
import CustomButton from '../components/CustomButton';
import SegmentedTabs from '../components/SegmentedTabs';
import { HeroSkeleton, ListSkeleton } from '../components/SkeletonLoader';
import { onExpenseChanged } from '../utils/expenseEvents';
import { AddExpenseContext } from './AddExpenseScreen';

type AnalysisTab = 'overview' | 'items' | 'merchants';

const formatCurrency = (amount: number) => `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AnalysisScreen() {
    const { accessToken, userEmail } = useAuth();
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const qc = useQueryClient();
    const { openAddExpense } = React.useContext(AddExpenseContext);

    const [tab, setTab] = useState<AnalysisTab>('overview');
    const [includeGroups, setIncludeGroups] = useState(true);
    const scope = includeGroups ? 'combined' : 'personal';
    // TrackSpense v3 Mobile mock's category drill-down (`anCat`/`anHasCat`): tapping a category
    // in the "WHERE IT WENT" legend swaps the overview content in place for that category's own
    // transaction list, with a "‹ Categories" link back — was missing entirely (legend rows
    // weren't tappable at all).
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    const now = useMemo(() => new Date(), []);
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const { data: groupsEnabled } = useQuery({
        queryKey: ['groupsEnabled'],
        queryFn: checkGroupsEnabled,
    });

    const { data, isLoading: loadingAnalysis } = useQuery({
        queryKey: ['analysis', userEmail, year, month, scope],
        queryFn: () => getAnalysis(accessToken!, userEmail!, { year, month, scope }),
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

    const monthLabel = now.toLocaleString('default', { month: 'long' }).toUpperCase();
    const prevMonthLabel = new Date(year, month - 2, 1).toLocaleString('default', { month: 'long' });

    const total = data?.total_expenses || 0;
    const palette = categoryPalette(theme);
    const segments = useMemo(() => {
        const cats = data?.category_totals || [];
        return cats.map((c, i) => ({
            ...c,
            pct: total > 0 ? (c.total / total) * 100 : 0,
            color: palette[i % palette.length],
        }));
    }, [data, total]);

    // Simple day-of-month projection for the insight callout — the mock's own line ("On pace for
    // $2,180 this month — Dining is up 34%...") is illustrative demo copy, not backed by a
    // dedicated backend projection endpoint, so this is a lightweight client-side estimate.
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(year, month, 0).getDate();
    const onPaceTotal = dayOfMonth > 0 ? (total / dayOfMonth) * daysInMonth : total;
    const topInsight = insights[0];
    const insightLine = topInsight
        ? `On pace for ${formatCurrency(onPaceTotal)} this month — ${topInsight.metric_name} is ${topInsight.change_percent > 0 ? 'up' : 'down'} ${Math.abs(topInsight.change_percent).toFixed(0)}% vs last month.`
        : `On pace for ${formatCurrency(onPaceTotal)} this month.`;

    const items: ItemInsightSummary[] = topItemsData || [];
    const merchants: MerchantInsightSummary[] = topMerchantsData || [];
    const topMerchantSpend = merchants[0]?.total_spent || 0;

    return (
        <ScreenWrapper>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                <Text style={styles.heading}>Analysis</Text>

                <View style={styles.tabsRow}>
                    <SegmentedTabs<AnalysisTab>
                        value={tab}
                        onChange={(t) => { setTab(t); setSelectedCategory(null); }}
                        options={[
                            { value: 'overview', label: 'Overview' },
                            { value: 'items', label: 'Items' },
                            { value: 'merchants', label: 'Merchants' },
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
                        <View style={styles.emptyCard}>
                            <Text style={styles.emptyIcon}>📊</Text>
                            <Text style={styles.emptyTitle}>No expenses this month yet</Text>
                            <Text style={styles.emptySubtitle}>Add an expense to see category breakdowns and trends.</Text>
                            <CustomButton title="Add an Expense" onPress={() => openAddExpense()} fullWidth={false} style={{ marginTop: 4 }} />
                        </View>
                    ) : selectedCategory ? (
                        (() => {
                            const catSegment = segments.find((s) => s.category === selectedCategory);
                            const catTxns = data?.category_expense_details?.[selectedCategory] ?? [];
                            return (
                                <View style={styles.section}>
                                    <TouchableOpacity onPress={() => setSelectedCategory(null)} activeOpacity={0.6} style={styles.catBackLink}>
                                        <Text style={styles.catBackText}>‹ Categories</Text>
                                    </TouchableOpacity>
                                    <View style={styles.catHeaderCard}>
                                        <Text style={[styles.catHeaderDot, { color: catSegment?.color ?? theme.colors.textTertiary }]}>●</Text>
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Text style={styles.catHeaderName} numberOfLines={1}>{selectedCategory}</Text>
                                            <Text style={styles.catHeaderSub}>
                                                {catTxns.length} transaction{catTxns.length === 1 ? '' : 's'} · {(catSegment?.pct ?? 0).toFixed(0)}% of {monthLabel.charAt(0) + monthLabel.slice(1).toLowerCase()}
                                            </Text>
                                        </View>
                                        <Text style={styles.catHeaderTotal}>{formatCurrency(catSegment?.total ?? 0)}</Text>
                                    </View>
                                    {catTxns.length === 0 ? (
                                        <View style={styles.emptyCard}>
                                            <Text style={styles.emptySubtitle}>No transactions found.</Text>
                                        </View>
                                    ) : (
                                        <View style={[styles.changesCard, { marginTop: 10 }]}>
                                            {catTxns.map((t, i) => (
                                                <View key={`${t.date}-${i}`} style={[styles.changeRow, i === catTxns.length - 1 && styles.rowLast]}>
                                                    <View style={{ flex: 1, minWidth: 0 }}>
                                                        <Text style={styles.changeName} numberOfLines={1}>{t.description}</Text>
                                                        <Text style={styles.changeWhy} numberOfLines={1}>{t.date}</Text>
                                                    </View>
                                                    <Text style={styles.changeAmount}>{formatCurrency(t.cost)}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            );
                        })()
                    ) : (
                        <>
                            <View style={styles.card}>
                                <Text style={styles.cardLabel}>WHERE IT WENT — {monthLabel}</Text>
                                <View style={styles.bar}>
                                    {segments.map((s) => (
                                        <View key={s.category} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
                                    ))}
                                </View>
                                <View style={styles.legend}>
                                    {segments.map((s) => (
                                        <TouchableOpacity key={s.category} style={styles.legendItem} onPress={() => setSelectedCategory(s.category)} activeOpacity={0.6}>
                                            <Text style={[styles.legendDot, { color: s.color }]}>●</Text>
                                            <Text style={styles.legendText}>{s.category} {s.pct.toFixed(0)}%</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                {groupsEnabled && (
                                    <View style={styles.toggleRow}>
                                        <Text style={styles.toggleLabel}>Include group shares</Text>
                                        <Switch
                                            value={includeGroups}
                                            onValueChange={setIncludeGroups}
                                            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                                            thumbColor="#fff"
                                        />
                                    </View>
                                )}
                            </View>

                            {insights.length > 0 && (
                                <View style={styles.section}>
                                    <Text style={styles.sectionLabel}>WHAT CHANGED VS {prevMonthLabel.toUpperCase()}</Text>
                                    <View style={styles.changesCard}>
                                        {insights.slice(0, 5).map((c, i) => {
                                            const up = c.change_percent > 0;
                                            return (
                                                <View key={`${c.metric_name}-${i}`} style={[styles.changeRow, i === insights.slice(0, 5).length - 1 && styles.rowLast]}>
                                                    <View style={{ flex: 1, minWidth: 0 }}>
                                                        <Text style={styles.changeName} numberOfLines={1}>{c.metric_name}</Text>
                                                        {!!c.entity_name && <Text style={styles.changeWhy} numberOfLines={1}>{c.entity_name}</Text>}
                                                    </View>
                                                    <Text style={[styles.changeDelta, { color: up ? theme.colors.warning : theme.colors.success }]}>
                                                        {up ? '+' : '−'}{Math.abs(c.change_percent).toFixed(0)}%
                                                    </Text>
                                                </View>
                                            );
                                        })}
                                    </View>
                                </View>
                            )}

                            <View style={styles.insightCallout}>
                                <Text style={{ fontSize: 15 }}>💡</Text>
                                <Text style={styles.insightText}>{insightLine}</Text>
                            </View>
                        </>
                    )
                )}

                {tab === 'items' && (
                    <View style={styles.section}>
                        <Text style={styles.tabIntro}>Line items from receipts and splits, ranked by month-to-date spend.</Text>
                        {loadingItems ? (
                            <ListSkeleton count={4} />
                        ) : items.length === 0 ? (
                            <View style={styles.emptyCard}>
                                <Text style={styles.emptyIcon}>🛒</Text>
                                <Text style={styles.emptyTitle}>No item data yet</Text>
                                <Text style={styles.emptySubtitle}>Scan a receipt to unlock item-level insights.</Text>
                            </View>
                        ) : (
                            <View style={styles.changesCard}>
                                {items.map((it, i) => (
                                    <View key={it.id} style={[styles.changeRow, i === items.length - 1 && styles.rowLast]}>
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Text style={styles.changeName} numberOfLines={1}>{it.item_name}</Text>
                                            <Text style={styles.changeWhy} numberOfLines={1}>
                                                {it.distinct_merchants_count ? `${it.distinct_merchants_count} merchant${it.distinct_merchants_count === 1 ? '' : 's'}` : 'Personal'}
                                            </Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={styles.changeAmount}>{formatCurrency(it.total_spent)}</Text>
                                            <Text style={styles.changeCount}>{it.transaction_count}×</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                )}

                {tab === 'merchants' && (
                    <View style={styles.section}>
                        <Text style={styles.tabIntro}>Where your money went, by merchant — group shares included.</Text>
                        {loadingMerchants ? (
                            <ListSkeleton count={4} />
                        ) : merchants.length === 0 ? (
                            <View style={styles.emptyCard}>
                                <Text style={styles.emptyIcon}>🏪</Text>
                                <Text style={styles.emptyTitle}>No merchant data yet</Text>
                                <Text style={styles.emptySubtitle}>Add merchant names to your expenses to unlock this.</Text>
                            </View>
                        ) : (
                            <View style={styles.changesCard}>
                                {merchants.map((m, i) => {
                                    const pct = topMerchantSpend > 0 ? (m.total_spent / topMerchantSpend) * 100 : 0;
                                    return (
                                        <View key={m.id} style={[styles.merchantRow, i === merchants.length - 1 && styles.rowLast]}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Text style={styles.changeName} numberOfLines={1}>{m.merchant_name}</Text>
                                                <Text style={styles.changeAmount}>{formatCurrency(m.total_spent)}</Text>
                                            </View>
                                            <View style={styles.merchantBarRow}>
                                                <View style={styles.merchantBarTrack}>
                                                    <View style={[styles.merchantBarFill, { width: `${pct}%`, backgroundColor: theme.colors.primary }]} />
                                                </View>
                                                <Text style={styles.changeCount}>{m.transaction_count} visit{m.transaction_count === 1 ? '' : 's'}</Text>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>
        </ScreenWrapper>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    heading: {
        fontFamily: 'BricolageGrotesque-SemiBold',
        fontSize: 22,
        color: theme.colors.text,
        letterSpacing: -0.3,
        paddingHorizontal: 18,
    },
    tabsRow: { paddingHorizontal: 18, marginTop: 12, marginBottom: 14, alignSelf: 'flex-start' },
    card: {
        marginHorizontal: 18,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.borderLight,
        borderRadius: 14,
        padding: 16,
    },
    cardLabel: { fontFamily: 'InstrumentSans-Bold', fontSize: 11, letterSpacing: 0.8, color: theme.colors.textTertiary },
    bar: {
        flexDirection: 'row',
        height: 14,
        borderRadius: 999,
        overflow: 'hidden',
        marginTop: 12,
        backgroundColor: theme.colors.surfaceSecondary,
    },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot: { fontSize: 12, fontWeight: '700' },
    legendText: { fontFamily: 'InstrumentSans-Regular', fontSize: 12, color: theme.colors.textSecondary },
    toggleRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.borderLight,
        marginTop: 14, paddingTop: 12,
    },
    toggleLabel: { fontFamily: 'InstrumentSans-Regular', fontSize: 12.5, color: theme.colors.textSecondary },
    section: { marginTop: 12, marginHorizontal: 18 },
    catBackLink: { alignSelf: 'flex-start', paddingVertical: 2 },
    catBackText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 13.5, color: theme.colors.primary },
    catHeaderCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.borderLight,
        borderRadius: 14, padding: 16, marginTop: 8,
    },
    catHeaderDot: { fontSize: 14 },
    catHeaderName: { fontFamily: 'InstrumentSans-Bold', fontSize: 15, color: theme.colors.text },
    catHeaderSub: { fontFamily: 'InstrumentSans-Regular', fontSize: 11.5, color: theme.colors.textTertiary, marginTop: 2 },
    catHeaderTotal: { fontFamily: 'BricolageGrotesque-SemiBold', fontSize: 22, color: theme.colors.text },
    sectionLabel: { fontFamily: 'InstrumentSans-Bold', fontSize: 11, letterSpacing: 0.8, color: theme.colors.textTertiary, marginBottom: 6 },
    tabIntro: { fontFamily: 'InstrumentSans-Regular', fontSize: 12, color: theme.colors.textTertiary, lineHeight: 17, marginBottom: 8 },
    changeAmount: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 13.5, color: theme.colors.text },
    changeCount: { fontFamily: 'InstrumentSans-Regular', fontSize: 10.5, color: theme.colors.textTertiary, marginTop: 2 },
    merchantRow: {
        paddingHorizontal: 14, paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight,
    },
    merchantBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    merchantBarTrack: { flex: 1, height: 6, borderRadius: 999, backgroundColor: theme.colors.surfaceSecondary, overflow: 'hidden' },
    merchantBarFill: { height: '100%', borderRadius: 999 },
    changesCard: {
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.borderLight,
        borderRadius: 14,
        overflow: 'hidden',
    },
    changeRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 14, paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight,
    },
    rowLast: { borderBottomWidth: 0 },
    changeName: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 13.5, color: theme.colors.text },
    changeWhy: { fontFamily: 'InstrumentSans-Regular', fontSize: 11.5, color: theme.colors.textTertiary, marginTop: 1 },
    changeDelta: { fontFamily: 'InstrumentSans-Bold', fontSize: 13, flexShrink: 0 },
    insightCallout: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        marginTop: 12, marginHorizontal: 18,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.borderLight,
        borderRadius: 14, padding: 14,
    },
    insightText: { flex: 1, fontFamily: 'InstrumentSans-Regular', fontSize: 12.5, color: theme.colors.textSecondary, lineHeight: 18 },
    emptyCard: {
        alignItems: 'center', paddingVertical: 36, marginHorizontal: 18,
        backgroundColor: theme.colors.surface, borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.borderLight,
    },
    emptyIcon: { fontSize: 40, marginBottom: 12 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text, marginBottom: 6, textAlign: 'center' },
    emptySubtitle: { fontSize: 13.5, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 16, paddingHorizontal: 24 },
});
