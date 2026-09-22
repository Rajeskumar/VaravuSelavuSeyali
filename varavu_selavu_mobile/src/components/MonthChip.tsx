import React, { useMemo, useState } from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { recentMonths } from '../utils/insightsFormat';
import OptionSheet from './OptionSheet';

interface MonthChipProps {
  /** 'YYYY-MM' */
  value: string;
  onChange: (value: string, year: number, month: number) => void;
}

/** The "Sep 2026 ▾" chip in the Insights header; opens the last twelve months. */
export default function MonthChip({ value, onChange }: MonthChipProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [open, setOpen] = useState(false);
  const months = useMemo(() => recentMonths(new Date()), []);
  const current = months.find((m) => m.value === value) ?? months[0];

  return (
    <>
      <TouchableOpacity style={styles.chip} activeOpacity={0.7} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`Month: ${current.label}`}>
        <Text style={styles.text}>{current.label} ▾</Text>
      </TouchableOpacity>
      <OptionSheet
        visible={open}
        title="Month"
        options={months.map((m) => ({ value: m.value, label: m.label }))}
        selected={value}
        onSelect={(v) => {
          const m = months.find((x) => x.value === v)!;
          onChange(m.value, m.year, m.month);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  chip: {
    height: 36, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  text: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 14, color: theme.colors.textSecondary },
});
