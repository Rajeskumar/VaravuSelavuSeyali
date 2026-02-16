import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useIsFocused } from '@react-navigation/native';
import { getAnalysis, AnalysisResponse } from '../api/analysis';
import { PieChart } from 'react-native-chart-kit';

export default function AnalysisScreen() {
    const { accessToken, userEmail, getValidToken } = useAuth();
    const isFocused = useIsFocused();
    const [data, setData] = useState<AnalysisResponse | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            if (!isFocused || !accessToken || !userEmail) return;
            setLoading(true);
            try {
                const token = await getValidToken();
                if (!token) return;
                const res = await getAnalysis(token, userEmail, {
                    year: new Date().getFullYear(),
                    month: new Date().getMonth() + 1,
                });
                setData(res);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [isFocused]);

    if (loading && !data) {
        return <View style={styles.center}><ActivityIndicator size="large" /></View>;
    }

    // Calculate category totals from category_totals array
    // If category_totals is missing or empty, fallback to 0
    const totalAmount = data?.category_totals?.reduce((acc, curr) => acc + curr.total, 0) || 1;

    // Prepare chart data
    const chartData = data?.category_totals.map((item, index) => ({
        name: item.category,
        population: item.total,
        color: `hsl(${index * 40}, 70%, 50%)`,
        legendFontColor: "#7F7F7F",
        legendFontSize: 12,
        percentage: ((item.total / totalAmount) * 100).toFixed(1)
    })) || [];

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.title}>Spending by Category</Text>

            {chartData.length > 0 ? (
                <PieChart
                    data={chartData}
                    width={Dimensions.get('window').width - 40}
                    height={220}
                    chartConfig={{
                        backgroundColor: "#e26a00",
                        backgroundGradientFrom: "#fb8c00",
                        backgroundGradientTo: "#ffa726",
                        decimalPlaces: 2,
                        color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                        labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                        style: {
                            borderRadius: 16
                        },
                        propsForDots: {
                            r: "6",
                            strokeWidth: "2",
                            stroke: "#ffa726"
                        }
                    }}
                    accessor={"population"}
                    backgroundColor={"transparent"}
                    paddingLeft={"15"}
                    center={[10, 0]}
                    absolute
                />
            ) : (
                <Text style={{ textAlign: 'center', margin: 20 }}>No data for this month</Text>
            )}

            <Text style={styles.subtitle}>Details</Text>
            <View style={styles.table}>
                <View style={styles.rowHeader}>
                    <Text style={styles.headerCell}>Category</Text>
                    <Text style={styles.headerCellRight}>Total</Text>
                </View>
                {data?.category_totals.map((item, index) => (
                    <View key={index} style={styles.row}>
                        <Text style={styles.cell}>{item.category}</Text>
                        <Text style={styles.cellRight}>${item.total.toFixed(2)}</Text>
                    </View>
                ))}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: '#fff',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginTop: 20,
        marginBottom: 10,
    },
    table: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 5,
        marginBottom: 40,
    },
    rowHeader: {
        flexDirection: 'row',
        backgroundColor: '#f0f0f0',
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#ddd',
    },
    row: {
        flexDirection: 'row',
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    headerCell: {
        flex: 1,
        fontWeight: 'bold',
    },
    headerCellRight: {
        flex: 1,
        fontWeight: 'bold',
        textAlign: 'right',
    },
    cell: {
        flex: 1,
    },
    cellRight: {
        flex: 1,
        textAlign: 'right',
    }
});
