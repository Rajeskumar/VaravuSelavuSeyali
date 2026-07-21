import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, withAlpha } from '../theme';

type BadgeTone = 'violet' | 'cyan' | 'positive' | 'negative' | 'caution' | 'neutral';

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Small dot to the left of the label, pulsing 1↔0.35 opacity over 2s. Use for "live"/"active" states. */
  pulse?: boolean;
}

/** Pill status indicator (CerebroOS design system §3) — mono uppercase label, optional pulsing dot. */
export default function Badge({ label, tone = 'cyan', pulse = false }: BadgeProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const toneColor = useMemo(() => toneColorFor(theme, tone), [theme, tone]);

  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!pulse) return;
    opacity.value = withRepeat(
      withTiming(0.35, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse, opacity]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: withAlpha(toneColor, 0.08), borderColor: withAlpha(toneColor, 0.25) },
      ]}
    >
      {pulse && (
        <Animated.View style={[styles.dot, { backgroundColor: toneColor }, dotStyle]} />
      )}
      <Text style={[styles.label, { color: toneColor }]}>{label}</Text>
    </View>
  );
}

function toneColorFor(theme: AppTheme, tone: BadgeTone): string {
  switch (tone) {
    case 'violet': return theme.colors.primary;
    case 'cyan': return theme.colors.secondary;
    case 'positive': return theme.colors.success;
    case 'negative': return theme.colors.error;
    case 'caution': return theme.colors.warning;
    case 'neutral': return theme.colors.textSecondary;
  }
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderRadius: theme.borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    ...theme.typography.eyebrow,
  },
});
