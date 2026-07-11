import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { categoryPalette } from '../utils/chartTheme';
import Card from './Card';

/**
 * TS-DES-105 — ranked category list (Design Spec §4.3's "ranked spectrum" treatment: a
 * proportional row + amount + percentage per category, most-spent first), used as the default
 * mobile category view alongside a small demoted donut ornament.
 *
 * Deliberately page-local and NOT named/shaped as a shared "SpendSpectrum" component: TS-DES-103
 * (Dashboard rebuild, running concurrently in a separate workstream) may introduce a web
 * `SpendSpectrum.tsx` for that ticket's own scope. This is HomeScreen-specific and intentionally
 * small — see this ticket's write-up for a note about revisiting consolidation once TS-DES-103
 * lands, rather than solving that here.
 */

interface CategoryTotal {
    category: string;
    total: number;
}

interface CategoryRankedListProps {
    data: CategoryTotal[];
    title?: string;
    maxRows?: number;
    /** Optional per-row tap handler (e.g. Analysis's "see this category's transactions" sheet).
     * HomeScreen doesn't pass this — rows stay a plain, non-interactive `View` there. */
    onSelectCategory?: (category: string) => void;
}

export default function CategoryRankedList({ data, title = 'Top Categories', maxRows = 5, onSelectCategory }: CategoryRankedListProps) {
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const colors = useMemo(() => categoryPalette(theme), [theme]);

    const grandTotal = useMemo(() => data.reduce((s, d) => s + d.total, 0), [data]);
    const ranked = useMemo(
        () => [...data].sort((a, b) => b.total - a.total).slice(0, maxRows),
        [data, maxRows]
    );

    if (ranked.length === 0 || grandTotal === 0) {
        return null;
    }

    return (
        <Card>
            <Text style={[theme.typography.h3, { marginBottom: 14 }]}>{title}</Text>
            {ranked.map((row, i) => {
                const pct = grandTotal > 0 ? (row.total / grandTotal) * 100 : 0;
                const color = colors[i % colors.length];
                const RowContainer = onSelectCategory ? TouchableOpacity : View;
                const rowContainerProps = onSelectCategory
                    ? { onPress: () => onSelectCategory(row.category), activeOpacity: 0.7 }
                    : {};
                return (
                    <RowContainer key={row.category} style={styles.row} {...rowContainerProps}>
                        <View style={styles.rowHeader}>
                            <Text style={[styles.rowLabel, { color }]} numberOfLines={1}>{row.category}</Text>
                            <Text style={styles.rowAmount}>${row.total.toFixed(0)}</Text>
                        </View>
                        <View style={styles.barTrack}>
                            <View style={[styles.barFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: color }]} />
                        </View>
                        <Text style={styles.rowPct}>{pct.toFixed(1)}%</Text>
                    </RowContainer>
                );
            })}
        </Card>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    row: {
        marginBottom: 14,
    },
    rowHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    rowLabel: {
        flex: 1,
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.text,
    },
    rowAmount: {
        fontSize: 14,
        fontWeight: '700',
        color: theme.colors.text,
        fontVariant: ['tabular-nums'],
    },
    barTrack: {
        height: 6,
        borderRadius: 3,
        backgroundColor: theme.colors.surfaceSecondary,
        overflow: 'hidden',
    },
    barFill: {
        height: '100%',
        borderRadius: 3,
    },
    rowPct: {
        fontSize: 11,
        color: theme.colors.textTertiary,
        marginTop: 4,
    },
});
