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
        // Mock's pill track is `width: fit-content` — hugs its buttons' natural size, it never
        // stretches to fill the parent. `alignSelf: 'flex-start'` here makes that self-contained
        // instead of relying on every call site to remember to wrap this in a shrink-to-fit View
        // (most didn't, which combined with the `flex: 1` tabs below to actively break things —
        // see `tab` comment).
        alignSelf: 'flex-start',
        // Mock's pill track is a distinct muted gray (#EFEFEA), not near-white — `background`
        // (#FAFAFA) was only one shade off `surface` (#FFFFFF), so the active white pill had no
        // contrast to show against once this sits directly on a screen background instead of a
        // white card (Expenses/Analysis/Groups/GroupDetail all render it that way).
        backgroundColor: theme.colors.secondarySurface,
        borderRadius: 20,
        padding: 4,
    },
    tab: {
        // Mock's pill buttons (`pill()` in the design source) are sized purely by their own
        // padding + label text, never stretched to an equal-width column — `flex: 1` here forced
        // each tab to divide whatever width this row resolved to. Yoga (native) and browser
        // flexbox resolve "flex:1 children inside an auto-width row" differently: the browser
        // fell back to each tab's content size (so this merely looked slightly off), but on iOS
        // Yoga collapsed the whole row toward zero width, squeezing the label text away entirely
        // — the "blank switch" bug. Natural sizing removes the ambiguity outright.
        paddingVertical: 6,
        paddingHorizontal: 14,
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
