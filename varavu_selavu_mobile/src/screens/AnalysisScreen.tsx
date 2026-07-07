import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { getAnalysis, AnalysisResponse } from '../api/analysis';
import { getChangeInsights, ChangeInsight } from '../api/analytics';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { categoryPalette } from '../utils/chartTheme';
import ScreenWrapper from '../components/ScreenWrapper';
import Card from '../components/Card';
import CustomButton from '../components/CustomButton';
import { HeroSkeleton, ListSkeleton } from '../components/SkeletonLoader';
import { TrendNavigator } from '../components/analysis/TrendNavigator';
import { InsightRail } from '../components/analysis/InsightRail';
import { AskSheet } from '../components/analysis/AskSheet';
import { onExpenseChanged } from '../utils/expenseEvents';
import { AddExpenseContext } from './AddExpenseScreen';

export default function AnalysisScreen() {
    const { accessToken, userEmail } = useAuth();
    const navigation = useNavigation<any>();
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    
    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [data, setData] = useState<AnalysisResponse | null>(null);
    const [insights, setInsights] = useState<ChangeInsight[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedInsight, setSelectedInsight] = useState<ChangeInsight | null>(null);
    const { openAddExpense } = useContext(AddExpenseContext);

    const fetchData = useCallback(async () => {
        if (!accessToken || !userEmail) return;
        setLoading(true);
        try {
            const [analysisRes, insightsRes] = await Promise.all([
                getAnalysis(accessToken, userEmail, { year, month }),
                getChangeInsights(userEmail, { year, month }).catch(() => [])
            ]);
            setData(analysisRes);
            setInsights(insightsRes);
        } catch (error) {
            console.error('Analysis fetch error', error);
        } finally {
            setLoading(false);
        }
    }, [accessToken, userEmail, year, month]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // TS-DES-112: the global "+" opens as a Modal overlay (not a navigator screen), so it never
    // triggers a focus-change refetch here — listen for the expense-changed signal too.
    useEffect(() => onExpenseChanged(() => fetchData()), [fetchData]);

    const formatCurrency = (amount: number) => `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    if (loading && !data) {
        return (
            <ScreenWrapper scroll>
                <HeroSkeleton />
                <ListSkeleton count={4} />
            </ScreenWrapper>
        );
    }

    const chartColors = categoryPalette(theme);
    const isEmpty = data?.total_expenses === 0 && data?.category_totals.length === 0;

    return (
        <ScreenWrapper>
            <ScrollView showsVerticalScrollIndicator={false}>
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

                {data?.monthly_trend && (
                    <TrendNavigator
                        monthlyTrend={data.monthly_trend}
                        selectedMonth={month}
                        year={year}
                        onSelect={setMonth}
                    />
                )}

                {isEmpty ? (
                    <Card style={styles.emptyCard}>
                        <View style={styles.emptyIconBadge}>
                            <Ionicons name="stats-chart" size={32} color={theme.colors.primary} />
                        </View>
                        <Text style={styles.emptyTitle}>No expenses this month yet</Text>
                        <Text style={styles.emptySubtitle}>Add an expense to see category breakdowns and trends.</Text>
                        <CustomButton title="Add an Expense" onPress={openAddExpense} fullWidth={false} style={{ marginTop: 4 }} />
                    </Card>
                ) : data ? (
                    <>
                        <InsightRail insights={insights} onAsk={setSelectedInsight} />

                        <View style={styles.summaryContainer}>
                            <Text style={styles.summaryLabel}>Total This Month</Text>
                            <Text style={styles.summaryAmount}>{formatCurrency(data.total_expenses)}</Text>
                            <Text style={styles.summaryCategories}>
                                across {data.category_totals.length} categories
                            </Text>
                        </View>

                        <View style={styles.breakdownSection}>
                            <Text style={styles.sectionTitle}>Category Details</Text>
                            {data.category_totals.map((ct, index) => {
                                const pct = data.total_expenses > 0 ? (ct.total / data.total_expenses) * 100 : 0;
                                const color = chartColors[index % chartColors.length];
                                const txCount = data.category_expense_details?.[ct.category]?.length ?? 0;
                                return (
                                    <View key={`category-${ct.category}-${index}`} style={styles.breakdownRow}>
                                        <View style={[styles.breakdownDot, { backgroundColor: color }]} />
                                        <View style={styles.breakdownInfo}>
                                            <Text style={styles.breakdownCategory}>{ct.category}</Text>
                                            <Text style={styles.breakdownMeta}>
                                                {txCount} transaction{txCount !== 1 ? 's' : ''}
                                            </Text>
                                        </View>
                                        <View style={styles.breakdownRight}>
                                            <Text style={styles.breakdownAmount}>{formatCurrency(ct.total)}</Text>
                                            <Text style={styles.breakdownPct}>{pct.toFixed(1)}%</Text>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    </>
                ) : null}
            </ScrollView>

            <AskSheet
                insight={selectedInsight}
                onClose={() => setSelectedInsight(null)}
                year={year}
                month={month}
            />
        </ScreenWrapper>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    crossLinkRow: { flexDirection: 'row', gap: 8, marginBottom: 12, paddingHorizontal: 16 },
    crossLinkChip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    },
    crossLinkText: { fontSize: 12, fontWeight: '600', color: theme.colors.primary },
    emptyCard: { alignItems: 'center', paddingVertical: 36, marginHorizontal: 16 },
    emptyIconBadge: {
        width: 64, height: 64, borderRadius: 20, marginBottom: 12,
        backgroundColor: theme.colors.primarySurface, alignItems: 'center', justifyContent: 'center',
    },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 6, textAlign: 'center' },
    emptySubtitle: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 20, paddingHorizontal: 20 },

    summaryContainer: {
        alignItems: 'center',
        paddingVertical: 24,
        marginHorizontal: 16,
        backgroundColor: theme.colors.surface,
        borderRadius: 20,
        marginBottom: 24,
        ...theme.shadows.sm,
    },
    summaryLabel: { fontFamily: 'Inter-SemiBold', fontSize: 13, color: theme.colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' },
    summaryAmount: { fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 40, color: theme.colors.text, marginVertical: 8, letterSpacing: -1 },
    summaryCategories: { fontFamily: 'Inter-Regular', fontSize: 13, color: theme.colors.textTertiary },

    breakdownSection: { paddingHorizontal: 16, paddingBottom: 24 },
    sectionTitle: { fontFamily: 'Inter-Bold', fontSize: 16, color: theme.colors.text, marginBottom: 16 },
    breakdownRow: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface,
        paddingVertical: 16, paddingHorizontal: 16, borderRadius: 14, marginBottom: 10,
        ...theme.shadows.sm,
    },
    breakdownDot: { width: 12, height: 12, borderRadius: 6, marginRight: 14 },
    breakdownInfo: { flex: 1 },
    breakdownCategory: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: theme.colors.text },
    breakdownMeta: { fontFamily: 'Inter-Regular', fontSize: 13, color: theme.colors.textTertiary, marginTop: 4 },
    breakdownRight: { alignItems: 'flex-end' },
    breakdownAmount: { fontFamily: 'Inter-Bold', fontSize: 15, color: theme.colors.text },
    breakdownPct: { fontFamily: 'Inter-Regular', fontSize: 13, color: theme.colors.textTertiary, marginTop: 4 },
});
