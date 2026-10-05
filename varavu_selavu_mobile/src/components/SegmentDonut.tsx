import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { donutDashes } from '../utils/segments';

interface SegmentDonutProps {
  segments: { key: string; pct: number; color: string }[];
  centerValue: string;
  centerLabel?: string;
  size?: number;
}

const RADIUS = 16;
const STROKE = 6;
const VIEWBOX = 42;
const CIRC = 2 * Math.PI * RADIUS;

/** V2 category donut — flat stroke segments on a 42-unit viewbox, total in the middle. */
export default function SegmentDonut({ segments, centerValue, centerLabel = 'TOTAL', size = 112 }: SegmentDonutProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const dashes = useMemo(() => donutDashes(segments.map((s) => s.pct), CIRC), [segments]);

  return (
    <View style={{ width: size, height: size }} accessible accessibilityLabel={`${centerLabel} ${centerValue}`}>
      {/* Rotated so the first segment starts at 12 o'clock. */}
      <Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={21} cy={21} r={RADIUS} fill="none" stroke={theme.colors.surfaceSecondary} strokeWidth={STROKE} />
        {segments.map((s, i) => (
          <Circle
            key={s.key}
            cx={21}
            cy={21}
            r={RADIUS}
            fill="none"
            stroke={s.color}
            strokeWidth={STROKE}
            strokeDasharray={`${dashes[i].dash} ${dashes[i].gap}`}
            strokeDashoffset={dashes[i].offset}
          />
        ))}
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>{centerValue}</Text>
        <Text style={styles.label}>{centerLabel}</Text>
      </View>
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  value: { fontFamily: theme.typography.fontFamily.display, fontSize: 19, letterSpacing: -0.6, color: theme.colors.text, fontVariant: ['tabular-nums'] },
  label: { fontFamily: theme.typography.fontFamily.monoRegular, fontSize: 9, letterSpacing: 1.1, color: theme.colors.textTertiary },
});
