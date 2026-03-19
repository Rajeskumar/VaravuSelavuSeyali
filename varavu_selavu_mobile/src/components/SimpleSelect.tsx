import React, { useState, useMemo } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, FlatList, Platform } from 'react-native';
import { theme } from '../theme';

export interface Option {
  label: string;
  value: string;
}

interface SimpleSelectProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
}

export default function SimpleSelect({ label, value, onChange, options, placeholder = 'Select' }: SimpleSelectProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => options.find(o => o.value === value), [options, value]);

  const handleSelect = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity style={styles.control} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={styles.valueText}>{selected?.label ?? placeholder}</Text>
        <Text style={styles.chevron}>▾</Text>
      </TouchableOpacity>
      <Modal
        visible={open}
        animationType={Platform.OS === 'ios' ? 'slide' : 'fade'}
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label || 'Select'}</Text>
              <TouchableOpacity onPress={() => setOpen(false)}><Text style={styles.close}>✕</Text></TouchableOpacity>
            </View>
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.option} onPress={() => handleSelect(item.value)}>
                  <Text style={styles.optionText}>{item.label}</Text>
                  {item.value === value ? <Text style={styles.check}>✓</Text> : null}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 },
  control: {
    height: 40,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...theme.shadows.sm,
  },
  valueText: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
  chevron: { color: theme.colors.textTertiary, fontSize: 16, marginLeft: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '70%',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 16,
    ...theme.shadows.lg,
  },
  sheetHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  close: { fontSize: 18, color: theme.colors.textSecondary },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.borderLight },
  option: { paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionText: { fontSize: 15, color: theme.colors.text },
  check: { color: theme.colors.primary, fontSize: 16, fontWeight: '700' },
});
