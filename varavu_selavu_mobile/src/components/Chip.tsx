import React, { useMemo } from 'react';
import { Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, withAlpha } from '../theme';

interface ChipProps {
  label: string;
  /** `solid` = the one active filter (ink pill); `accent` = selected value in a sheet (violet tint). */
  variant?: 'outline' | 'solid' | 'accent';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** V2 filter/capture chip. 32–34px pill; outline by default. */
export default function Chip({ label, variant = 'outline', onPress, style }: ChipProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.chip, variant === 'solid' && styles.solid, variant === 'accent' && styles.accent, style]}
    >
      <Text
        numberOfLines={1}
        style={[styles.label, variant === 'solid' && styles.labelSolid, variant === 'accent' && styles.labelAccent]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  chip: {
    height: 32, paddingHorizontal: 13, borderRadius: 999,
    borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  solid: { backgroundColor: theme.colors.text, borderColor: theme.colors.text },
  accent: {
    backgroundColor: withAlpha(theme.colors.primary, 0.16),
    borderColor: withAlpha(theme.colors.primary, 0.3),
    borderRadius: 11,
  },
  label: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 13, color: theme.colors.textSecondary },
  labelSolid: { color: theme.colors.background },
  labelAccent: { color: theme.colors.primaryLight },
});
