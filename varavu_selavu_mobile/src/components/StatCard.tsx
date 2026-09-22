import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';

interface StatCardProps { label: string; value: string; color?: string }

/** Bordered 16px-radius stat tile: mono label over a Bricolage figure (V2 item/merchant detail). */
export default function StatCard({ label, value, color }: StatCardProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  card: { flex: 1, borderWidth: 1, borderColor: theme.colors.borderLight, borderRadius: 16, padding: 14 },
  label: { fontFamily: theme.typography.fontFamily.mono, fontSize: 10, letterSpacing: 1.4, color: theme.colors.textTertiary, textTransform: 'uppercase' },
  value: { fontFamily: theme.typography.fontFamily.display, fontSize: 24, color: theme.colors.text, marginTop: 5, fontVariant: ['tabular-nums'] },
});
