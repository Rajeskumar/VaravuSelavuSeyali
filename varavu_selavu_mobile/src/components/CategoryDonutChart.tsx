import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { G, Path, Circle } from 'react-native-svg';
import { theme } from '../theme';
import Card from './Card';

const CHART_COLORS = [
    '#059669', '#0EA5E9', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16',
];

const SUB_CHART_COLORS = [
    '#34D399', '#38BDF8', '#FCD34D', '#F87171', '#A78BFA',
    '#F472B6', '#5EEAD4', '#FB923C', '#818CF8', '#A3E635',
    '#6EE7B7', '#7DD3FC', '#FDE68A', '#FCA5A5', '#C4B5FD',
];

interface CategoryData {
    category: string;
    total: number;
    subcategories?: { name: string; total: number }[];
}

interface CategoryDonutChartProps {
    data: CategoryData[];
    title?: string;
}

const screenWidth = Dimensions.get('window').width;
const SIZE = Math.min(screenWidth - 100, 260);
const CENTER = SIZE / 2;
const OUTER_RADIUS = SIZE / 2 - 8;
const OUTER_WIDTH = 28;
const INNER_RADIUS = OUTER_RADIUS - OUTER_WIDTH - 6;
const INNER_WIDTH = 18;

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

export default function CategoryDonutChart({ data, title = 'Expense Breakdown' }: CategoryDonutChartProps) {
    const grandTotal = useMemo(() => data.reduce((s, d) => s + d.total, 0), [data]);

    const outerArcs = useMemo(() => {
        let startAngle = 0;
        return data.map((cat, i) => {
            const sweep = grandTotal > 0 ? (cat.total / grandTotal) * 360 : 0;
            const arc = {
                path: describeArc(CENTER, CENTER, OUTER_RADIUS - OUTER_WIDTH / 2, startAngle, startAngle + sweep),
                color: CHART_COLORS[i % CHART_COLORS.length],
                label: cat.category,
                total: cat.total,
                pct: grandTotal > 0 ? ((cat.total / grandTotal) * 100).toFixed(1) : '0',
            };
            startAngle += sweep;
            return arc;
        });
    }, [data, grandTotal]);

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
                        color: SUB_CHART_COLORS[colorIdx % SUB_CHART_COLORS.length],
                    });
                    startAngle += sweep;
                    colorIdx++;
                });
            } else {
                const sweep = grandTotal > 0 ? (cat.total / grandTotal) * 360 : 0;
                arcs.push({
                    path: describeArc(CENTER, CENTER, INNER_RADIUS - INNER_WIDTH / 2, startAngle, startAngle + sweep),
                    color: SUB_CHART_COLORS[colorIdx % SUB_CHART_COLORS.length],
                });
                startAngle += sweep;
                colorIdx++;
            }
        });
        return arcs;
    }, [data, grandTotal]);

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
        <Card>
            <Text style={[theme.typography.h3, { marginBottom: 16 }]}>{title}</Text>
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
                    <Circle cx={CENTER} cy={CENTER} r={INNER_RADIUS - INNER_WIDTH - 4} fill={theme.colors.surface} />
                </Svg>

                {/* Center total overlay */}
                <View style={styles.centerLabel}>
                    <Text style={styles.centerAmount}>${grandTotal.toFixed(0)}</Text>
                    <Text style={styles.centerSubtext}>total</Text>
                </View>
            </View>

            {/* Legend */}
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
        </Card>
    );
}

const styles = StyleSheet.create({
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
