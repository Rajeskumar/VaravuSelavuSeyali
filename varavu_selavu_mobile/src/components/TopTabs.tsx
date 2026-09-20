import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StyleProp, ViewStyle } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';

interface TopTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  style?: StyleProp<ViewStyle>;
}

/** V2 tab strip — text labels on a hairline with a 2px accent underline on the active one. Replaces
 * the pill-style SegmentedTabs on every screen that has sub-sections (Spend, Groups, Insights). */
export default function TopTabs<T extends string>({ value, onChange, options, style }: TopTabsProps<T>) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={[styles.wrap, style]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => onChange(opt.value)}
              activeOpacity={0.7}
              style={[styles.tab, active && styles.tabActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight },
  row: { gap: 22 },
  tab: { paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -StyleSheet.hairlineWidth },
  tabActive: { borderBottomColor: theme.colors.primary },
  label: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 15, color: theme.colors.textTertiary },
  labelActive: { fontFamily: theme.typography.fontFamily.bold, color: theme.colors.text },
});
