import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity,
    Modal, FlatList, ActivityIndicator,
} from 'react-native';
import { PieChart } from 'react-native-chart-kit';
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

export default function AnalysisScreen() {
    const { accessToken, userEmail } = useAuth();
    const [data, setData] = useState<AnalysisResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [drillDownVisible, setDrillDownVisible] = useState(false);

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

    const openDrillDown = (category: string) => {
        setSelectedCategory(category);
        setDrillDownVisible(true);
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
                            <TouchableOpacity onPress={() => setDrillDownVisible(false)} activeOpacity={0.7}>
                                <Text style={styles.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.modalSubtitle}>
                            {drillDownItems.length} transaction{drillDownItems.length !== 1 ? 's' : ''} •{' '}
                            {formatCurrency(drillDownItems.reduce((sum, e) => sum + e.cost, 0))} total
                        </Text>
                        <FlatList
                            data={drillDownItems}
                            keyExtractor={(item, index) => `${item.date}-${item.description}-${item.cost}-${index}`}
                            renderItem={({ item }) => (
                                <View style={styles.drillDownRow}>
                                    <View style={styles.drillDownInfo}>
                                        <Text style={styles.drillDownDesc} numberOfLines={1}>
                                            {item.description}
                                        </Text>
                                        <Text style={styles.drillDownDate}>{item.date}</Text>
                                    </View>
                                    <Text style={styles.drillDownCost}>{formatCurrency(item.cost)}</Text>
                                </View>
                            )}
                            ListEmptyComponent={
                                <Text style={styles.drillDownEmpty}>No transactions found</Text>
                            }
                            style={{ maxHeight: 400 }}
                        />
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
        padding: 24, paddingBottom: 40, maxHeight: '70%',
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
});
