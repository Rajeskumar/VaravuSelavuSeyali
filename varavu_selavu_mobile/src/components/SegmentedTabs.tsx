import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';

interface SegmentedTabsOption<T extends string> {
    value: T;
    label: string;
}

interface SegmentedTabsProps<T extends string> {
    value: T;
    onChange: (value: T) => void;
    options: SegmentedTabsOption<T>[];
}

export default function SegmentedTabs<T extends string>({ value, onChange, options }: SegmentedTabsProps<T>) {
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    return (
        <View style={styles.container}>
            {options.map((opt) => {
                const isActive = value === opt.value;
                return (
                    <TouchableOpacity
                        key={opt.value}
                        style={[styles.tab, isActive && styles.activeTab]}
                        onPress={() => onChange(opt.value)}
                        activeOpacity={0.8}
                    >
                        <Text style={[styles.tabText, isActive && styles.activeTabText]}>
                            {opt.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        flexDirection: 'row',
        backgroundColor: theme.colors.background,
        borderRadius: 20,
        padding: 4,
    },
    tab: {
        flex: 1,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    activeTab: {
        backgroundColor: theme.colors.surface,
        ...theme.shadows.sm,
    },
    tabText: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    activeTabText: {
        color: theme.colors.primary,
        fontWeight: '700',
    },
});
