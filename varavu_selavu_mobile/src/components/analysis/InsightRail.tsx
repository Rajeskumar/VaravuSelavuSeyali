import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { AppTheme } from '../../theme';
import { ChangeInsight } from '../../api/analytics';

interface InsightRailProps {
    insights: ChangeInsight[];
    onAsk: (insight: ChangeInsight) => void;
}

export const InsightRail: React.FC<InsightRailProps> = ({ insights, onAsk }) => {
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);

    if (!insights || insights.length === 0) return null;

    const formatCurrency = (val: number) => `$${Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>WHAT CHANGED</Text>
            </View>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {insights.map((insight, idx) => {
                    const isUp = insight.change_amount > 0;
                    return (
                        <View key={`${insight.metric_name}-${idx}`} style={styles.card}>
                            <View style={styles.cardHeader}>
                                <Text style={styles.metricName}>{insight.metric_name}</Text>
                                <View style={[styles.badge, { backgroundColor: isUp ? theme.colors.errorSurface : theme.colors.successSurface }]}>
                                    <Ionicons
                                        name={isUp ? 'arrow-up' : 'arrow-down'}
                                        size={12}
                                        color={isUp ? theme.colors.error : theme.colors.success}
                                    />
                                    <Text style={[styles.badgeText, { color: isUp ? theme.colors.error : theme.colors.success }]}>
                                        {formatCurrency(insight.change_amount)}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.cardBody}>
                                <View>
                                    <Text style={styles.valueLabel}>This {insight.time_scope}</Text>
                                    <Text style={styles.currentValue}>{formatCurrency(insight.current_value)}</Text>
                                </View>
                                <View>
                                    <Text style={styles.valueLabel}>Last {insight.time_scope}</Text>
                                    <Text style={styles.previousValue}>{formatCurrency(insight.previous_value)}</Text>
                                </View>
                            </View>

                            <TouchableOpacity
                                style={styles.askButton}
                                onPress={() => onAsk(insight)}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="sparkles" size={14} color={theme.colors.primary} />
                                <Text style={styles.askText}>Ask why</Text>
                            </TouchableOpacity>
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        marginBottom: 24,
    },
    header: {
        paddingHorizontal: 20,
        marginBottom: 12,
    },
    headerTitle: {
        fontFamily: 'Inter-Bold',
        fontSize: 11,
        letterSpacing: 0.6,
        color: theme.colors.textSecondary,
    },
    scrollContent: {
        paddingHorizontal: 20,
        gap: 12,
    },
    card: {
        width: 260,
        backgroundColor: theme.colors.surface,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.colors.borderLight,
        ...theme.shadows.sm,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    metricName: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 15,
        color: theme.colors.text,
        flex: 1,
        marginRight: 8,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        gap: 2,
    },
    badgeText: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 12,
    },
    cardBody: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    valueLabel: {
        fontFamily: 'Inter-Regular',
        fontSize: 12,
        color: theme.colors.textTertiary,
        marginBottom: 4,
    },
    currentValue: {
        fontFamily: 'SpaceGrotesk-SemiBold',
        fontSize: 18,
        color: theme.colors.text,
    },
    previousValue: {
        fontFamily: 'SpaceGrotesk-SemiBold',
        fontSize: 18,
        color: theme.colors.textSecondary,
    },
    askButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.borderLight,
    },
    askText: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 13,
        color: theme.colors.primary,
    },
});
