import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { G, Path, Circle } from 'react-native-svg';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, withAlpha } from '../theme';
import { categoryPalette, categoryHexPalette } from '../utils/chartTheme';
import Card from './Card';

interface CategoryData {
    category: string;
    total: number;
    subcategories?: { name: string; total: number }[];
}

interface CategoryDonutChartProps {
    data: CategoryData[];
    title?: string;
    /**
     * TS-DES-105: per the Reconcile redesign, the donut is demoted to a small glanceable
     * secondary ornament — the ranked category list is the default mobile category view now.
     * Pass `compact` when this chart sits alongside/below a ranked list instead of leading a
     * screen; it shrinks the chart and drops the legend (the ranked list nearby covers that).
     */
    compact?: boolean;
}

const screenWidth = Dimensions.get('window').width;

function sizeFor(compact: boolean) {
    const size = compact ? Math.min(screenWidth - 220, 120) : Math.min(screenWidth - 100, 260);
    const center = size / 2;
    const outerWidth = compact ? 14 : 28;
    const outerRadius = size / 2 - (compact ? 4 : 8);
    const innerWidth = compact ? 9 : 18;
    const innerRadius = outerRadius - outerWidth - (compact ? 3 : 6);
    return { SIZE: size, CENTER: center, OUTER_RADIUS: outerRadius, OUTER_WIDTH: outerWidth, INNER_RADIUS: innerRadius, INNER_WIDTH: innerWidth };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
    // Clamp to avoid full circle issues
    const sweep = Math.min(endAngle - startAngle, 359.99);
    const endAng = startAngle + sweep;

    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((endAng - 90) * Math.PI) / 180;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);

    const largeArc = sweep > 180 ? 1 : 0;

    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

export default function CategoryDonutChart({ data, title = 'Expense Breakdown', compact = false }: CategoryDonutChartProps) {
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const grandTotal = useMemo(() => data.reduce((s, d) => s + d.total, 0), [data]);
    const { SIZE, CENTER, OUTER_RADIUS, OUTER_WIDTH, INNER_RADIUS, INNER_WIDTH } = useMemo(() => sizeFor(compact), [compact]);
    const chartColors = useMemo(() => categoryPalette(theme), [theme]);
    // Subcategory ring cycles the plain hex base palette (not the pre-mixed `chartColors`, which
    // already contains `withAlpha`-derived rgba entries) so a single alpha pass here stays valid.
    const subChartColors = useMemo(() => {
        const base = categoryHexPalette(theme);
        return base.map((c) => withAlpha(c, 0.7));
    }, [theme]);

    const outerArcs = useMemo(() => {
        let startAngle = 0;
        return data.map((cat, i) => {
            const sweep = grandTotal > 0 ? (cat.total / grandTotal) * 360 : 0;
            const arc = {
                path: describeArc(CENTER, CENTER, OUTER_RADIUS - OUTER_WIDTH / 2, startAngle, startAngle + sweep),
                color: chartColors[i % chartColors.length],
                label: cat.category,
                total: cat.total,
                pct: grandTotal > 0 ? ((cat.total / grandTotal) * 100).toFixed(1) : '0',
            };
            startAngle += sweep;
            return arc;
        });
    }, [data, grandTotal, CENTER, OUTER_RADIUS, OUTER_WIDTH, chartColors]);

    const innerArcs = useMemo(() => {
        const arcs: { path: string; color: string }[] = [];
        let startAngle = 0;
        let colorIdx = 0;
        data.forEach((cat) => {
            if (cat.subcategories && cat.subcategories.length > 0) {
                cat.subcategories.forEach((sub) => {
                    const sweep = grandTotal > 0 ? (sub.total / grandTotal) * 360 : 0;
                    arcs.push({
                        path: describeArc(CENTER, CENTER, INNER_RADIUS - INNER_WIDTH / 2, startAngle, startAngle + sweep),
                        color: subChartColors[colorIdx % subChartColors.length],
                    });
                    startAngle += sweep;
                    colorIdx++;
                });
            } else {
                const sweep = grandTotal > 0 ? (cat.total / grandTotal) * 360 : 0;
                arcs.push({
                    path: describeArc(CENTER, CENTER, INNER_RADIUS - INNER_WIDTH / 2, startAngle, startAngle + sweep),
                    color: subChartColors[colorIdx % subChartColors.length],
                });
                startAngle += sweep;
                colorIdx++;
            }
        });
        return arcs;
    }, [data, grandTotal, CENTER, INNER_RADIUS, INNER_WIDTH, subChartColors]);

    if (data.length === 0 || grandTotal === 0) {
        return (
            <Card>
                <Text style={[theme.typography.h3, { marginBottom: 8 }]}>{title}</Text>
                <Text style={{ color: theme.colors.textTertiary, textAlign: 'center', paddingVertical: 20 }}>
                    No expense data available
                </Text>
            </Card>
        );
    }

    return (
        <Card style={compact ? styles.compactCard : undefined}>
            <Text style={[compact ? theme.typography.label : theme.typography.h3, { marginBottom: compact ? 8 : 16 }]}>{title}</Text>
            <View style={styles.chartContainer}>
                <Svg width={SIZE} height={SIZE}>
                    {/* Inner ring — subcategories */}
                    <G>
                        {innerArcs.map((arc, i) => (
                            <Path
                                key={`inner-${i}`}
                                d={arc.path}
                                fill="none"
                                stroke={arc.color}
                                strokeWidth={INNER_WIDTH}
                                strokeLinecap="round"
                                opacity={0.7}
                            />
                        ))}
                    </G>
                    {/* Outer ring — parent categories */}
                    <G>
                        {outerArcs.map((arc, i) => (
                            <Path
                                key={`outer-${i}`}
                                d={arc.path}
                                fill="none"
                                stroke={arc.color}
                                strokeWidth={OUTER_WIDTH}
                                strokeLinecap="round"
                            />
                        ))}
                    </G>
                    {/* Center label */}
                    <Circle cx={CENTER} cy={CENTER} r={Math.max(INNER_RADIUS - INNER_WIDTH - 4, 0)} fill={theme.colors.surface} />
                </Svg>

                {/* Center total overlay */}
                <View style={styles.centerLabel}>
                    <Text style={compact ? styles.centerAmountCompact : styles.centerAmount}>${grandTotal.toFixed(0)}</Text>
                    {!compact && <Text style={styles.centerSubtext}>total</Text>}
                </View>
            </View>

            {/* Legend — dropped in compact mode; the ranked list next to it already shows this. */}
            {!compact && (
                <View style={styles.legend}>
                    {outerArcs.slice(0, 5).map((arc, i) => (
                        <View key={arc.label} style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: arc.color }]} />
                            <Text style={styles.legendLabel} numberOfLines={1}>{arc.label}</Text>
                            <Text style={styles.legendPct}>{arc.pct}%</Text>
                        </View>
                    ))}
                    {outerArcs.length > 5 && (
                        <Text style={styles.legendMore}>+{outerArcs.length - 5} more</Text>
                    )}
                </View>
            )}
        </Card>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    compactCard: {
        alignSelf: 'flex-start',
    },
    chartContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    centerLabel: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    centerAmount: {
        fontSize: 22,
        fontWeight: '800',
        color: theme.colors.text,
        letterSpacing: -0.5,
    },
    centerAmountCompact: {
        fontSize: 13,
        fontWeight: '700',
        color: theme.colors.text,
        letterSpacing: -0.2,
    },
    centerSubtext: {
        fontSize: 12,
        color: theme.colors.textTertiary,
        fontWeight: '500',
        marginTop: 2,
    },
    legend: {
        gap: 8,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    legendDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    legendLabel: {
        flex: 1,
        fontSize: 13,
        fontWeight: '500',
        color: theme.colors.text,
    },
    legendPct: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    legendMore: {
        fontSize: 12,
        color: theme.colors.textTertiary,
        marginTop: 4,
    },
});
