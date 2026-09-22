import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import Sheet from './Sheet';

export interface Option<T extends string> { value: T; label: string; hint?: string }

interface OptionSheetProps<T extends string> {
  visible: boolean;
  title: string;
  options: Option<T>[];
  /** Single selection. */
  selected?: T | null;
  /** Multi selection (takes precedence over `selected`). */
  selectedMany?: T[];
  onSelect: (value: T) => void;
  onClose: () => void;
  /** Extra action row under the list, e.g. "Clear". */
  footer?: React.ReactNode;
}

/** A titled list of choices in a V2 bottom sheet — the shared picker behind the month chip and the
 * Spend filter chips. */
export default function OptionSheet<T extends string>({ visible, title, options, selected, selectedMany, onSelect, onClose, footer }: OptionSheetProps<T>) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isSel = (v: T) => (selectedMany ? selectedMany.includes(v) : selected === v);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <TouchableOpacity onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={16} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
        {options.map((o) => (
          <TouchableOpacity key={o.value} style={styles.row} activeOpacity={0.6} onPress={() => onSelect(o.value)}>
            <Text style={[styles.label, isSel(o.value) && styles.labelOn]}>{o.label}</Text>
            {o.hint ? <Text style={styles.hint}>{o.hint}</Text> : null}
            {isSel(o.value) ? <Ionicons name="checkmark" size={18} color={theme.colors.primary} /> : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
      {footer}
    </Sheet>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: theme.typography.fontFamily.bold, fontSize: 19, letterSpacing: -0.3, color: theme.colors.text },
  close: { width: 32, height: 32, borderRadius: 11, backgroundColor: theme.colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight,
  },
  label: { flex: 1, fontFamily: theme.typography.fontFamily.medium, fontSize: 15, color: theme.colors.textSecondary },
  labelOn: { fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.text },
  hint: { fontFamily: theme.typography.fontFamily.regular, fontSize: 13, color: theme.colors.textTertiary },
});
