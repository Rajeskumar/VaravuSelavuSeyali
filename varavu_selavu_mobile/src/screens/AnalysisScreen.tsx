import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Dimensions, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useIsFocused } from '@react-navigation/native';
import { getAnalysis, AnalysisResponse } from '../api/analysis';
import { PieChart } from 'react-native-chart-kit';
import { theme } from '../theme';

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
                month: new Date().getMonth() + 1
            })
                .then(res => setData(res))
                .catch(err => console.error(err))
                .finally(() => setLoading(false));
        }
    }, [isFocused, accessToken, userEmail]);

    if (loading && !data) {
        return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;
    }

    // Calculate category totals from category_totals array
    const totalAmount = data?.category_totals?.reduce((acc, curr) => acc + curr.total, 0) || 1;

    // Modern Color Palette for Chart
    const chartColors = [
        '#FF6384',
        '#36A2EB',
        '#FFCE56',
        '#4BC0C0',
        '#9966FF',
        '#FF9F40',
        '#8D6E63',
        '#AB47BC',
        '#29B6F6',
        '#66BB6A'
    ];

    const chartData = data?.category_totals.map((item, index) => ({
        name: item.category,
        population: item.total,
        color: chartColors[index % chartColors.length],
        legendFontColor: "#666",
        legendFontSize: 12,
    })) || [];

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 80 }}>
            <View style={styles.header}>
                <Text style={theme.typography.h2}>Analytics</Text>
            </View>

            <View style={styles.chartCard}>
                <Text style={styles.cardTitle}>Spending by Category</Text>
                {chartData.length > 0 ? (
                    <PieChart
                        data={chartData}
                        width={Dimensions.get('window').width - 60}
                        height={220}
                        chartConfig={{
                            color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                        }}
                        accessor={"population"}
                        backgroundColor={"transparent"}
                        paddingLeft={"15"}
                        center={[10, 0]}
                        absolute
                        hasLegend={true}
                    />
                ) : (
                    <View style={styles.emptyChart}>
                        <Text style={styles.emptyText}>No data available for this month.</Text>
                    </View>
                )}
            </View>

            <Text style={styles.sectionTitle}>Breakdown</Text>

            <View style={styles.tableCard}>
                {data?.category_totals.map((item, index) => (
                    <View key={index} style={styles.row}>
                        <View style={styles.rowLeft}>
                            <View style={[styles.dot, { backgroundColor: chartColors[index % chartColors.length] }]} />
                            <Text style={styles.categoryName}>{item.category}</Text>
                        </View>
                        <Text style={styles.amountText}>${item.total.toFixed(2)}</Text>
                    </View>
                ))}
                {(!data?.category_totals || data.category_totals.length === 0) && (
                    <Text style={{ textAlign: 'center', color: '#999', padding: 20 }}>No expenses recorded.</Text>
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
        padding: 20,
        paddingTop: Platform.OS === 'android' ? 40 : 20,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        marginBottom: 20,
    },
    chartCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
        marginBottom: 25,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
        alignItems: 'center',
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 10,
        alignSelf: 'flex-start',
    },
    emptyChart: {
        height: 200,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        color: '#999',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 15,
        color: '#333',
    },
    tableCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        paddingHorizontal: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#f5f5f5',
    },
    rowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 10,
    },
    categoryName: {
        fontSize: 16,
        color: '#333',
        fontWeight: '500',
    },
    amountText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
    }
});
