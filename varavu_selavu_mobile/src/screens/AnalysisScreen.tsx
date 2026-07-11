import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import ScreenWrapper from '../components/ScreenWrapper';
import Card from '../components/Card';
import CustomButton from '../components/CustomButton';
import SegmentedTabs from '../components/SegmentedTabs';
import CategoryRankedList from '../components/CategoryRankedList';
import { HeroSkeleton, ListSkeleton } from '../components/SkeletonLoader';
import { TrendNavigator } from '../components/analysis/TrendNavigator';
import { InsightRail } from '../components/analysis/InsightRail';
import { AskSheet } from '../components/analysis/AskSheet';
import { onExpenseChanged } from '../utils/expenseEvents';
import { AddExpenseContext } from './AddExpenseScreen';
import { CategoryTransactionsSheet, CategoryTransaction } from '../components/analysis/CategoryTransactionsSheet';

type PeriodMode = 'month' | 'year';

export default function AnalysisScreen() {
    const { accessToken, userEmail } = useAuth();
    const navigation = useNavigation<any>();
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);

    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
    const [selectedInsight, setSelectedInsight] = useState<ChangeInsight | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const { openAddExpense } = useContext(AddExpenseContext);
    const isYearMode = periodMode === 'year';

    const queryClient = useQueryClient();

    const { data: monthData, isLoading: loadingMonth } = useQuery({
        queryKey: ['analysis', userEmail, year, month, 'combined'],
        queryFn: () => getAnalysis(accessToken!, userEmail!, { year, month, scope: 'combined' }),
        enabled: !!accessToken && !!userEmail,
    });

    // Whole-year aggregate — answers "how much did I spend in 2026 on rent/groceries/dining
    // out", which the month-only view above can't. Only fetched when the Year tab is active;
    // `monthData` still powers TrendNavigator's month bars regardless of mode.
    const { data: yearData, isLoading: loadingYear } = useQuery({
        queryKey: ['analysis', userEmail, year, null, 'combined'],
        queryFn: () => getAnalysis(accessToken!, userEmail!, { year, scope: 'combined' }),
        enabled: !!accessToken && !!userEmail && isYearMode,
    });

    const data = isYearMode ? yearData : monthData;

    const { data: insightsData, isLoading: loadingInsights } = useQuery({
        queryKey: ['insights', userEmail, year, isYearMode ? undefined : month],
        queryFn: () => getChangeInsights(userEmail!, isYearMode ? { year } : { year, month }).catch(() => []),
        enabled: !!accessToken && !!userEmail,
    });

    const insights = insightsData || [];
    const loading = (isYearMode ? loadingYear : loadingMonth) || loadingInsights;

    useEffect(() => {
        return onExpenseChanged(() => {
            queryClient.invalidateQueries({ queryKey: ['analysis'] });
            queryClient.invalidateQueries({ queryKey: ['insights'] });
        });
    }, [queryClient]);

    const formatCurrency = (amount: number) => `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    if (loading && !data) {
        return (
            <ScreenWrapper scroll>
                <HeroSkeleton />
                <ListSkeleton count={4} />
            </ScreenWrapper>
        );
    }

    const isEmpty = data?.total_expenses === 0 && data?.category_totals.length === 0;
    const periodNoun = isYearMode ? 'this year' : 'this month';

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

                {/* Answers "how much did I spend in 2026 on rent/groceries/dining out" — Year
                    swaps the summary/breakdown below to the whole calendar year's totals instead
                    of just the selected month. */}
                <View style={styles.periodToggleRow}>
                    <SegmentedTabs<PeriodMode>
                        value={periodMode}
                        onChange={setPeriodMode}
                        options={[
                            { value: 'month', label: 'Month' },
                            { value: 'year', label: 'Year' },
                        ]}
                    />
                </View>

                {!isYearMode && monthData?.monthly_trend && (
                    <TrendNavigator
                        monthlyTrend={monthData.monthly_trend}
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
                        <Text style={styles.emptyTitle}>No expenses {periodNoun} yet</Text>
                        <Text style={styles.emptySubtitle}>Add an expense to see category breakdowns and trends.</Text>
                        <CustomButton title="Add an Expense" onPress={openAddExpense} fullWidth={false} style={{ marginTop: 4 }} />
                    </Card>
                ) : data ? (
                    <>
                        <InsightRail insights={insights} onAsk={setSelectedInsight} />

                        <View style={styles.summaryContainer}>
                            <Text style={styles.summaryLabel}>{isYearMode ? `Total in ${year}` : 'Total This Month'}</Text>
                            <Text style={styles.summaryAmount}>{formatCurrency(data.total_expenses)}</Text>
                            <Text style={styles.summaryCategories}>
                                across {data.category_totals.length} categories
                            </Text>
                        </View>

                        <View style={styles.breakdownSection}>
                            <CategoryRankedList
                                data={data.category_totals}
                                title="Category Breakdown"
                                maxRows={data.category_totals.length}
                                onSelectCategory={setSelectedCategory}
                            />
                        </View>
                    </>
                ) : null}

                <AskSheet 
                    insight={selectedInsight} 
                    onClose={() => setSelectedInsight(null)} 
                    year={year}
                    month={month}
                />

                <CategoryTransactionsSheet
                    visible={!!selectedCategory}
                    category={selectedCategory}
                    transactions={(selectedCategory && data?.category_expense_details?.[selectedCategory]) || []}
                    onClose={() => setSelectedCategory(null)}
                />
            </ScrollView>
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
    periodToggleRow: { paddingHorizontal: 16, marginBottom: 12 },
});
