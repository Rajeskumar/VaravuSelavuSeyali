import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity,
    Modal, FlatList, ActivityIndicator,
} from 'react-native';
import { PieChart, LineChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getAnalysis, AnalysisResponse } from '../api/analysis';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { categoryPalette, baseChartConfig } from '../utils/chartTheme';
import ScreenWrapper from '../components/ScreenWrapper';
import Card from '../components/Card';
import { HeroSkeleton, ListSkeleton } from '../components/SkeletonLoader';

const screenWidth = Dimensions.get('window').width;
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function AnalysisScreen() {
    const { accessToken, userEmail } = useAuth();
    const navigation = useNavigation<any>();
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const [data, setData] = useState<AnalysisResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [drillDownVisible, setDrillDownVisible] = useState(false);

    // Category trend chart state
    const [trendData, setTrendData] = useState<{ labels: string[]; values: number[] } | null>(null);
    const [trendLoading, setTrendLoading] = useState(false);

    useEffect(() => {
        const fetchAnalysis = async () => {
            if (!accessToken || !userEmail) return;
            try {
                const now = new Date();
                const result = await getAnalysis(accessToken, userEmail, {
                    year: now.getFullYear(),
                    month: now.getMonth() + 1,
                });
                setData(result);
            } catch (error) {
                console.error('Analysis fetch error', error);
            } finally {
                setLoading(false);
            }
        };
        fetchAnalysis();
    }, []);

    // Fetch 4-month trend for a specific category
    const fetchCategoryTrend = useCallback(async (category: string) => {
        if (!accessToken || !userEmail) return;
        setTrendLoading(true);
        setTrendData(null);
        try {
            const now = new Date();
            const promises: Promise<AnalysisResponse>[] = [];
            const monthLabels: string[] = [];

            for (let i = 3; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                monthLabels.push(MONTH_ABBR[d.getMonth()]);
                promises.push(
                    getAnalysis(accessToken, userEmail, {
                        year: d.getFullYear(),
                        month: d.getMonth() + 1,
                    })
                );
            }

            const results = await Promise.all(promises);
            const values = results.map((r) => {
                const ct = r.category_totals.find(
                    (c) => c.category.toLowerCase() === category.toLowerCase()
                );
                return ct ? ct.total : 0;
            });

            setTrendData({ labels: monthLabels, values });
        } catch (error) {
            console.error('Category trend fetch error', error);
        } finally {
            setTrendLoading(false);
        }
    }, [accessToken, userEmail]);

    const openDrillDown = (category: string) => {
        setSelectedCategory(category);
        setDrillDownVisible(true);
        fetchCategoryTrend(category);
    };

    const closeDrillDown = () => {
        setDrillDownVisible(false);
        setTrendData(null);
    };

    const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

    if (loading) {
        return (
            <ScreenWrapper scroll>
                <HeroSkeleton />
                <ListSkeleton count={4} />
            </ScreenWrapper>
        );
    }

    if (!data) {
        return (
            <ScreenWrapper scroll>
                <Card>
                    <Text style={{ textAlign: 'center', color: theme.colors.textSecondary, padding: 24 }}>
                        No analysis data available
                    </Text>
                </Card>
            </ScreenWrapper>
        );
    }

    const chartColors = categoryPalette(theme);
    const chartData = data.category_totals.map((ct, index) => ({
        name: ct.category,
        amount: ct.total,
        color: chartColors[index % chartColors.length],
        legendFontColor: theme.colors.textSecondary,
        legendFontSize: 12,
    }));

    const drillDownItems = selectedCategory && data.category_expense_details
        ? data.category_expense_details[selectedCategory] || []
        : [];

    const trendChartConfig = {
        ...baseChartConfig(theme),
        strokeWidth: 3,
        propsForBackgroundLines: {
            strokeDasharray: '0',
            stroke: theme.colors.borderLight,
            strokeWidth: 1,
        },
        propsForDots: {
            r: '5',
            strokeWidth: '2',
            stroke: theme.colors.primary,
            fill: theme.colors.surface,
        },
        fillShadowGradientFrom: theme.colors.primary,
        fillShadowGradientTo: theme.colors.primarySurface,
        fillShadowGradientFromOpacity: 0.4,
        fillShadowGradientToOpacity: 0.05,
        useShadowColorFromDataset: false,
    };

    const isEmpty = data.total_expenses === 0 && data.category_totals.length === 0;

    return (
        <ScreenWrapper scroll>
            {/* Cross-links to Item/Merchant Insights */}
            <View style={styles.crossLinkRow}>
                <TouchableOpacity style={styles.crossLinkChip} onPress={() => navigation.navigate('ItemInsights')} activeOpacity={0.7}>
                    <Ionicons name="pricetag" size={14} color={theme.colors.primary} />
                    <Text style={styles.crossLinkText}>Item Insights</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.crossLinkChip} onPress={() => navigation.navigate('MerchantInsights')} activeOpacity={0.7}>
                    <Ionicons name="storefront" size={14} color={theme.colors.primary} />
                    <Text style={styles.crossLinkText}>Merchant Insights</Text>
                </TouchableOpacity>
            </View>

            {isEmpty ? (
                <Card style={styles.emptyCard}>
                    <View style={styles.emptyIconBadge}>
                        <Ionicons name="stats-chart" size={32} color={theme.colors.primary} />
                    </View>
                    <Text style={styles.emptyTitle}>No expenses this month yet</Text>
                    <Text style={styles.emptySubtitle}>Add an expense to see category breakdowns and trends.</Text>
                    <TouchableOpacity style={styles.emptyCta} onPress={() => navigation.navigate('Add Expense')} activeOpacity={0.8}>
                        <Text style={styles.emptyCtaText}>Add an Expense</Text>
                    </TouchableOpacity>
                </Card>
            ) : (
            <>
            {/* Summary Card */}
            <Card style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Total This Month</Text>
                <Text style={styles.summaryAmount}>{formatCurrency(data.total_expenses)}</Text>
                <Text style={styles.summaryCategories}>
                    across {data.category_totals.length} categories
                </Text>
            </Card>

            {/* Category Breakdown — Tappable. Ranked list is the default/primary category view
                (Design Spec §4.3's "demote the donut" direction); the pie renders as a small
                secondary ornament below, not the lead visual. */}
            <View style={styles.breakdownSection}>
                <Text style={[theme.typography.h3, { marginBottom: 14 }]}>Category Details</Text>
                {data.category_totals.map((ct, index) => {
                    const pct = data.total_expenses > 0 ? (ct.total / data.total_expenses) * 100 : 0;
                    const color = chartColors[index % chartColors.length];
                    const txCount = data.category_expense_details?.[ct.category]?.length ?? 0;
                    return (
                        <TouchableOpacity
                            key={`category-${ct.category}-${index}`}
                            style={styles.breakdownRow}
                            onPress={() => openDrillDown(ct.category)}
                            activeOpacity={0.6}
                        >
                            <View style={[styles.breakdownDot, { backgroundColor: color }]} />
                            <View style={styles.breakdownInfo}>
                                <Text style={styles.breakdownCategory}>{ct.category}</Text>
                                <Text style={styles.breakdownMeta}>
                                    {txCount} transaction{txCount !== 1 ? 's' : ''} • Tap to view
                                </Text>
                            </View>
                            <View style={styles.breakdownRight}>
                                <Text style={styles.breakdownAmount}>{formatCurrency(ct.total)}</Text>
                                <Text style={styles.breakdownPct}>{pct.toFixed(1)}%</Text>
                            </View>
                            <Text style={styles.chevron}>›</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Pie — demoted to a small glanceable ornament under the ranked list, per TS-DES-105. */}
            {chartData.length > 0 && (
                <Card style={styles.pieOrnamentCard}>
                    <Text style={[theme.typography.label, { marginBottom: 8 }]}>At a glance</Text>
                    <PieChart
                        data={chartData}
                        width={140}
                        height={90}
                        chartConfig={{
                            color: () => theme.colors.primary,
                            labelColor: () => theme.colors.text,
                        }}
                        accessor="amount"
                        backgroundColor="transparent"
                        paddingLeft="0"
                        hasLegend={false}
                        absolute
                    />
                </Card>
            )}
            </>
            )}

            {/* Drill-down Modal */}
            <Modal visible={drillDownVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{selectedCategory}</Text>
                            <TouchableOpacity onPress={closeDrillDown} activeOpacity={0.7}>
                                <Text style={styles.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.modalSubtitle}>
                            {drillDownItems.length} transaction{drillDownItems.length !== 1 ? 's' : ''} •{' '}
                            {formatCurrency(drillDownItems.reduce((sum, e) => sum + e.cost, 0))} total
                        </Text>

                        <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
                            {/* Transaction list */}
                            {drillDownItems.length === 0 ? (
                                <Text style={styles.drillDownEmpty}>No transactions found</Text>
                            ) : (
                                drillDownItems.map((item, index) => (
                                    <View key={`drilldown-${item.date}-${index}`} style={styles.drillDownRow}>
                                        <View style={styles.drillDownInfo}>
                                            <Text style={styles.drillDownDesc} numberOfLines={1}>
                                                {item.description}
                                            </Text>
                                            <Text style={styles.drillDownDate}>{item.date}</Text>
                                        </View>
                                        <Text style={styles.drillDownCost}>{formatCurrency(item.cost)}</Text>
                                    </View>
                                ))
                            )}

                            {/* Category Trend Line Chart */}
                            <View style={styles.trendSection}>
                                <Text style={styles.trendTitle}>📈 Spending Trend (4 months)</Text>
                                {trendLoading ? (
                                    <View style={styles.trendLoader}>
                                        <ActivityIndicator size="small" color={theme.colors.primary} />
                                        <Text style={styles.trendLoaderText}>Loading trend data...</Text>
                                    </View>
                                ) : trendData && trendData.values.some((v) => v > 0) ? (
                                    <View style={styles.trendChartWrapper}>
                                        <LineChart
                                            data={{
                                                labels: trendData.labels,
                                                datasets: [{ data: trendData.values }],
                                            }}
                                            width={screenWidth - 96}
                                            height={180}
                                            chartConfig={trendChartConfig}
                                            bezier
                                            withInnerLines={true}
                                            withOuterLines={false}
                                            withVerticalLines={false}
                                            fromZero
                                            style={styles.trendChart}
                                        />
                                    </View>
                                ) : (
                                    <Text style={styles.trendEmpty}>No trend data available for this period</Text>
                                )}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </ScreenWrapper>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    crossLinkRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    crossLinkChip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    },
    crossLinkText: { fontSize: 12, fontWeight: '600', color: theme.colors.primary },
    emptyCard: { alignItems: 'center', paddingVertical: 36 },
    emptyIconBadge: {
        width: 64, height: 64, borderRadius: 20, marginBottom: 12,
        backgroundColor: theme.colors.primarySurface, alignItems: 'center', justifyContent: 'center',
    },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 6, textAlign: 'center' },
    emptySubtitle: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 20, paddingHorizontal: 20 },
    emptyCta: { backgroundColor: theme.colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24 },
    emptyCtaText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    summaryCard: { alignItems: 'center', paddingVertical: 28 },
    summaryLabel: { fontSize: 14, color: theme.colors.textSecondary, fontWeight: '500' },
    summaryAmount: { fontSize: 36, fontWeight: '800', color: theme.colors.primary, marginVertical: 6, letterSpacing: -1 },
    summaryCategories: { fontSize: 13, color: theme.colors.textTertiary },
    breakdownSection: { marginTop: 8 },
    pieOrnamentCard: { marginTop: 8, alignItems: 'flex-start', alignSelf: 'flex-start' },
    breakdownRow: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface,
        paddingVertical: 16, paddingHorizontal: 16, borderRadius: 14, marginBottom: 10,
        ...theme.shadows.sm,
    },
    breakdownDot: { width: 12, height: 12, borderRadius: 6, marginRight: 14 },
    breakdownInfo: { flex: 1 },
    breakdownCategory: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
    breakdownMeta: { fontSize: 12, color: theme.colors.textTertiary, marginTop: 2 },
    breakdownRight: { alignItems: 'flex-end', marginRight: 8 },
    breakdownAmount: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
    breakdownPct: { fontSize: 12, color: theme.colors.textTertiary, marginTop: 2 },
    chevron: { fontSize: 22, color: theme.colors.textTertiary, fontWeight: '300' },
    // Modal styles
    modalOverlay: {
        flex: 1, justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    modalContent: {
        backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: 24, paddingBottom: 24, maxHeight: '80%', flexShrink: 1,
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    modalTitle: { fontSize: 22, fontWeight: '700', color: theme.colors.text },
    modalClose: { fontSize: 22, color: theme.colors.textTertiary, padding: 8 },
    modalSubtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 20 },
    drillDownRow: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: theme.colors.border,
    },
    drillDownInfo: { flex: 1 },
    drillDownDesc: { fontSize: 15, fontWeight: '500', color: theme.colors.text },
    drillDownDate: { fontSize: 12, color: theme.colors.textTertiary, marginTop: 2 },
    drillDownCost: { fontSize: 16, fontWeight: '700', color: theme.colors.error },
    drillDownEmpty: { textAlign: 'center', color: theme.colors.textSecondary, paddingVertical: 30, fontSize: 15 },
    // Trend chart section
    trendSection: {
        marginTop: 24,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
    },
    trendTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: theme.colors.text,
        marginBottom: 16,
    },
    trendChartWrapper: {
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        paddingVertical: 12,
    },
    trendChart: {
        borderRadius: 16,
    },
    trendLoader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 30,
        gap: 10,
    },
    trendLoaderText: {
        fontSize: 14,
        color: theme.colors.textSecondary,
    },
    trendEmpty: {
        textAlign: 'center',
        color: theme.colors.textTertiary,
        paddingVertical: 24,
        fontSize: 14,
    },
});
