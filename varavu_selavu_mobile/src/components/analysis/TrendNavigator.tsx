import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useAppTheme } from '../../context/ThemeContext';
import { AppTheme } from '../../theme';

interface TrendNavigatorProps {
    monthlyTrend: { month: string; total: number }[];
    selectedMonth: number; // 1-12
    year: number;
    onSelect: (month: number) => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_WIDTH = Math.max(56, SCREEN_WIDTH * 0.15); // Approximate 15% width but min 56px

export const TrendNavigator: React.FC<TrendNavigatorProps> = ({ monthlyTrend, selectedMonth, year, onSelect }) => {
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const scrollRef = useRef<ScrollView>(null);

    // Create a 12-month array of totals for the year
    const allMonths = useMemo(() => {
        const arr = Array.from({ length: 12 }, (_, i) => {
            const d = new Date(year, i, 1);
            return {
                monthNum: i + 1,
                short: d.toLocaleString('default', { month: 'short' }),
                total: 0,
            };
        });
        monthlyTrend.forEach(m => {
            const [y, mm] = m.month.split('-');
            if (parseInt(y, 10) === year) {
                const idx = parseInt(mm, 10) - 1;
                if (idx >= 0 && idx < 12) {
                    arr[idx].total = m.total;
                }
            }
        });
        return arr;
    }, [monthlyTrend, year]);

    const displayMonths = useMemo(() => {
        const now = new Date();
        if (year === now.getFullYear()) {
            return allMonths.slice(0, now.getMonth() + 1);
        }
        return allMonths;
    }, [allMonths, year]);

    // Find the maximum total to scale the bars
    const max = Math.max(...displayMonths.map(m => m.total), 1);

    useEffect(() => {
        if (scrollRef.current) {
            // Calculate center
            const idx = displayMonths.findIndex(m => m.monthNum === selectedMonth);
            if (idx >= 0) {
                const centerOffset = (idx * ITEM_WIDTH) + (ITEM_WIDTH / 2) - (SCREEN_WIDTH / 2);
                scrollRef.current.scrollTo({ x: Math.max(0, centerOffset), animated: true });
            }
        }
    }, [selectedMonth, displayMonths.length, year]);

    const formatShort = (total: number) => {
        if (total >= 1000) return `$${(total / 1000).toFixed(1)}k`;
        return `$${Math.round(total)}`;
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerText}>SPEND OVER TIME · tap a month</Text>
            </View>
            <ScrollView
                ref={scrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {displayMonths.map((m) => {
                    const isSel = m.monthNum === selectedMonth;
                    const barH = Math.max(6, (m.total / max) * 64);

                    return (
                        <TouchableOpacity
                            key={m.monthNum}
                            style={styles.itemContainer}
                            onPress={() => onSelect(m.monthNum)}
                            activeOpacity={0.7}
                        >
                            <View style={styles.valueContainer}>
                                {isSel && (
                                    <Text style={styles.valueText}>{formatShort(m.total)}</Text>
                                )}
                            </View>
                            <View style={[
                                styles.bar,
                                { height: barH, backgroundColor: isSel ? theme.colors.text : theme.colors.border }
                            ]} />
                            <Text style={[
                                styles.monthText,
                                { color: isSel ? theme.colors.text : theme.colors.textSecondary, fontWeight: isSel ? '700' : '400' }
                            ]}>
                                {m.short}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        paddingBottom: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
        paddingHorizontal: 20,
    },
    headerText: {
        fontFamily: 'Inter-Bold',
        fontSize: 11,
        letterSpacing: 0.6,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
    },
    scrollContent: {
        paddingHorizontal: 20,
        height: 100,
        alignItems: 'flex-end',
        gap: 8,
    },
    itemContainer: {
        width: ITEM_WIDTH,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    valueContainer: {
        height: 16,
        justifyContent: 'flex-end',
        marginBottom: 4,
    },
    valueText: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 11,
        color: theme.colors.text,
    },
    bar: {
        width: 32,
        borderRadius: 4,
    },
    monthText: {
        marginTop: 8,
        fontFamily: 'Inter-Regular',
        fontSize: 11,
    },
});
