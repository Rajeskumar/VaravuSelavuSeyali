import React, { useMemo } from 'react';
import { Text, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';

interface SectionLabelProps {
  children: React.ReactNode;
  /** Defaults to the muted tertiary ink; pass a theme color for accent labels (e.g. cyan "Due in 3 days"). */
  color?: string;
  style?: StyleProp<TextStyle>;
}

/** 11px IBM Plex Mono, uppercase, 0.16em — the V2 section/eyebrow label used above every figure. */
export default function SectionLabel({ children, color, style }: SectionLabelProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return <Text style={[styles.label, color ? { color } : null, style]}>{children}</Text>;
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  label: {
    fontFamily: theme.typography.fontFamily.mono,
    fontSize: 11,
    letterSpacing: 1.76,
    textTransform: 'uppercase',
    color: theme.colors.textTertiary,
  },
});
