import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useAuth } from '../context/AuthContext';
import { getAnalysis } from '../api/analysis';
import { theme } from '../theme';
import Card from './Card';

const screenWidth = Dimensions.get('window').width;
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface TrendLineChartProps {
    title?: string;
}

export default function TrendLineChart({ title = '6-Month Trend' }: TrendLineChartProps) {
    const { accessToken, userEmail } = useAuth();
    const [trendData, setTrendData] = useState<{ labels: string[]; values: number[] } | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchTrend = useCallback(async () => {
        if (!accessToken || !userEmail) return;
        setLoading(true);
        try {
            const now = new Date();
            const promises: Promise<any>[] = [];
            const labels: string[] = [];

            for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                labels.push(MONTH_ABBR[d.getMonth()]);
                promises.push(
                    getAnalysis(accessToken, userEmail, {
                        year: d.getFullYear(),
                        month: d.getMonth() + 1,
                    })
                );
            }

            const results = await Promise.all(promises);
            const values = results.map((r) => r?.total_expenses ?? 0);

            setTrendData({ labels, values });
        } catch (error) {
            console.error('Trend fetch error', error);
        } finally {
            setLoading(false);
        }
    }, [accessToken, userEmail]);

    useEffect(() => {
        fetchTrend();
    }, [fetchTrend]);

    const chartConfig = {
        backgroundGradientFrom: theme.colors.surface,
        backgroundGradientTo: theme.colors.surface,
        color: (opacity = 1) => `rgba(14, 165, 233, ${opacity})`, // Sky blue
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
            stroke: '#0EA5E9',
            fill: theme.colors.surface,
        },
        fillShadowGradientFrom: '#0EA5E9',
        fillShadowGradientTo: '#E0F2FE',
        fillShadowGradientFromOpacity: 0.35,
        fillShadowGradientToOpacity: 0.02,
    };

    return (
        <Card>
            <Text style={[theme.typography.h3, { marginBottom: 16 }]}>{title}</Text>
            {loading ? (
                <View style={styles.loader}>
                    <ActivityIndicator size="small" color={theme.colors.secondary} />
                    <Text style={styles.loaderText}>Loading trend data...</Text>
                </View>
            ) : trendData && trendData.values.some((v) => v > 0) ? (
                <View style={styles.chartWrapper}>
                    <LineChart
                        data={{
                            labels: trendData.labels,
                            datasets: [{ data: trendData.values }],
                        }}
                        width={screenWidth - 80}
                        height={200}
                        chartConfig={chartConfig}
                        bezier
                        withInnerLines={true}
                        withOuterLines={false}
                        withVerticalLines={false}
                        fromZero
                        style={styles.chart}
                    />
                </View>
            ) : (
                <Text style={styles.empty}>No trend data available</Text>
            )}
        </Card>
    );
}

const styles = StyleSheet.create({
    chartWrapper: {
        alignItems: 'center',
    },
    chart: {
        borderRadius: 16,
    },
    loader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
        gap: 10,
    },
    loaderText: {
        fontSize: 14,
        color: theme.colors.textSecondary,
    },
    empty: {
        textAlign: 'center',
        color: theme.colors.textTertiary,
        paddingVertical: 30,
        fontSize: 14,
    },
});
