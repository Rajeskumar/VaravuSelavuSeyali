import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity,
    Modal, FlatList, ActivityIndicator,
} from 'react-native';
import { PieChart, LineChart } from 'react-native-chart-kit';
import { useAuth } from '../context/AuthContext';
import { getAnalysis, AnalysisResponse } from '../api/analysis';
import { theme } from '../theme';
import ScreenWrapper from '../components/ScreenWrapper';
import Card from '../components/Card';
import { HeroSkeleton, ListSkeleton } from '../components/SkeletonLoader';

const CHART_COLORS = [
    '#059669', '#0EA5E9', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
];

const screenWidth = Dimensions.get('window').width;
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function AnalysisScreen() {
    const { accessToken, userEmail } = useAuth();
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

    const chartData = data.category_totals.map((ct, index) => ({
        name: ct.category,
        amount: ct.total,
        color: CHART_COLORS[index % CHART_COLORS.length],
        legendFontColor: theme.colors.textSecondary,
        legendFontSize: 12,
    }));

    const drillDownItems = selectedCategory && data.category_expense_details
        ? data.category_expense_details[selectedCategory] || []
        : [];

    const trendChartConfig = {
        backgroundGradientFrom: theme.colors.surface,
        backgroundGradientTo: theme.colors.surface,
        color: (opacity = 1) => `rgba(5, 150, 105, ${opacity})`,
        labelColor: () => theme.colors.textSecondary,
        strokeWidth: 3,
        decimalPlaces: 0,
        propsForBackgroundLines: {
            strokeDasharray: '6 4',
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

    return (
        <ScreenWrapper scroll>
            {/* Summary Card */}
            <Card style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Total This Month</Text>
                <Text style={styles.summaryAmount}>{formatCurrency(data.total_expenses)}</Text>
                <Text style={styles.summaryCategories}>
                    across {data.category_totals.length} categories
                </Text>
            </Card>

            {/* Pie Chart */}
            {chartData.length > 0 && (
                <Card>
                    <Text style={[theme.typography.h3, { marginBottom: 16 }]}>Spending Breakdown</Text>
                    <PieChart
                        data={chartData}
                        width={screenWidth - 80}
                        height={200}
                        chartConfig={{
                            color: () => theme.colors.primary,
                            labelColor: () => theme.colors.text,
                        }}
                        accessor="amount"
                        backgroundColor="transparent"
                        paddingLeft="0"
                        absolute
                    />
                </Card>
            )}

            {/* Category Breakdown — Tappable */}
            <View style={styles.breakdownSection}>
                <Text style={[theme.typography.h3, { marginBottom: 14 }]}>Category Details</Text>
                {data.category_totals.map((ct, index) => {
                    const pct = data.total_expenses > 0 ? (ct.total / data.total_expenses) * 100 : 0;
                    const color = CHART_COLORS[index % CHART_COLORS.length];
                    const txCount = data.category_expense_details?.[ct.category]?.length ?? 0;
                    return (
                        <TouchableOpacity
                            key={`${ct.category}-${index}`}
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
                                    <View key={`${item.date}-${item.description}-${item.cost}-${index}`} style={styles.drillDownRow}>
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

const styles = StyleSheet.create({
    summaryCard: { alignItems: 'center', paddingVertical: 28 },
    summaryLabel: { fontSize: 14, color: theme.colors.textSecondary, fontWeight: '500' },
    summaryAmount: { fontSize: 36, fontWeight: '800', color: theme.colors.primary, marginVertical: 6, letterSpacing: -1 },
    summaryCategories: { fontSize: 13, color: theme.colors.textTertiary },
    breakdownSection: { marginTop: 8 },
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
