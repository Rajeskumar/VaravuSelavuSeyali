import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useIsFocused } from '@react-navigation/native';
import { getAnalysis, AnalysisResponse } from '../api/analysis';
import { PieChart } from 'react-native-chart-kit';
import { theme } from '../theme';
import ScreenWrapper from '../components/ScreenWrapper';
import Card from '../components/Card';
import { HeroSkeleton, ListSkeleton } from '../components/SkeletonLoader';

export default function AnalysisScreen() {
    const { accessToken, userEmail } = useAuth();
    const isFocused = useIsFocused();
    const [data, setData] = useState<AnalysisResponse | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isFocused && accessToken && userEmail) {
            setLoading(true);
            getAnalysis(accessToken, userEmail, {
                year: new Date().getFullYear(),
                month: new Date().getMonth() + 1,
            })
                .then((res) => setData(res))
                .catch((err) => console.error(err))
                .finally(() => setLoading(false));
        }
    }, [isFocused, accessToken, userEmail]);

    const chartColors = [
        '#059669', '#0EA5E9', '#F59E0B', '#EF4444', '#8B5CF6',
        '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
    ];

    const chartData = data?.category_totals.map((item, index) => ({
        name: item.category,
        population: item.total,
        color: chartColors[index % chartColors.length],
        legendFontColor: theme.colors.textSecondary,
        legendFontSize: 12,
    })) || [];

    const totalAmount = data?.category_totals?.reduce((acc, curr) => acc + curr.total, 0) || 0;

    if (loading && !data) {
        return (
            <ScreenWrapper scroll>
                <Text style={theme.typography.h2}>Analytics</Text>
                <Text style={styles.subtitle}>Your spending insights</Text>
                <HeroSkeleton />
                <ListSkeleton count={4} />
            </ScreenWrapper>
        );
    }

    return (
        <ScreenWrapper scroll>
            <Text style={theme.typography.h2}>Analytics</Text>
            <Text style={styles.subtitle}>Your spending insights</Text>

            <Card style={styles.totalCard}>
                <Text style={styles.totalLabel}>Total This Month</Text>
                <Text style={styles.totalAmount}>${totalAmount.toFixed(2)}</Text>
                <Text style={styles.totalCategories}>
                    Across {data?.category_totals?.length || 0} categories
                </Text>
            </Card>

            <Card style={styles.chartCard}>
                <Text style={styles.cardTitle}>Spending by Category</Text>
                {chartData.length > 0 ? (
                    <PieChart
                        data={chartData}
                        width={Dimensions.get('window').width - 80}
                        height={220}
                        chartConfig={{ color: (opacity = 1) => `rgba(0,0,0,${opacity})` }}
                        accessor="population"
                        backgroundColor="transparent"
                        paddingLeft="15"
                        center={[10, 0]}
                        absolute
                        hasLegend={true}
                    />
                ) : (
                    <View style={styles.emptyChart}>
                        <Text style={{ fontSize: 40, marginBottom: 10 }}>📊</Text>
                        <Text style={styles.emptyText}>No data for this month</Text>
                    </View>
                )}
            </Card>

            <Text style={[theme.typography.h3, { marginBottom: 14 }]}>Breakdown</Text>
            <Card noPadding>
                {data?.category_totals.map((item, index) => {
                    const pct = totalAmount > 0 ? ((item.total / totalAmount) * 100).toFixed(1) : '0.0';
                    return (
                        <View key={index} style={[styles.row, index < (data?.category_totals?.length || 0) - 1 && styles.rowBorder]}>
                            <View style={styles.rowLeft}>
                                <View style={[styles.dot, { backgroundColor: chartColors[index % chartColors.length] }]} />
                                <Text style={styles.catName}>{item.category}</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={styles.amtText}>${item.total.toFixed(2)}</Text>
                                <Text style={styles.pctText}>{pct}%</Text>
                            </View>
                        </View>
                    );
                })}
                {(!data?.category_totals || data.category_totals.length === 0) && (
                    <Text style={{ textAlign: 'center', color: theme.colors.textSecondary, padding: 30 }}>No expenses recorded.</Text>
                )}
            </Card>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    subtitle: { fontSize: 15, color: theme.colors.textSecondary, marginTop: 4, marginBottom: 20 },
    totalCard: { alignItems: 'center', paddingVertical: 28, backgroundColor: theme.colors.primarySurface, borderWidth: 1, borderColor: theme.colors.primaryLight + '40' },
    totalLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.primary, marginBottom: 6 },
    totalAmount: { fontSize: 36, fontWeight: '800', color: theme.colors.primaryDark, letterSpacing: -1 },
    totalCategories: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 },
    chartCard: { alignItems: 'center', paddingVertical: 24 },
    cardTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 16, alignSelf: 'flex-start' },
    emptyChart: { height: 180, justifyContent: 'center', alignItems: 'center' },
    emptyText: { color: theme.colors.textSecondary, fontSize: 15 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20 },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
    rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    dot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
    catName: { fontSize: 16, color: theme.colors.text, fontWeight: '500' },
    amtText: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
    pctText: { fontSize: 12, color: theme.colors.textTertiary, marginTop: 2 },
});
