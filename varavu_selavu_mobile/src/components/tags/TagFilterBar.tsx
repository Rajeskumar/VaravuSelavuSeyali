import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAppTheme } from '../../context/ThemeContext';
import { listTags } from '../../api/tags';

interface Props {
  value: string[]; // selected tag ids
  onChange: (ids: string[]) => void;
}

/**
 * TS-TAG-112 — the mobile tag filter (PRD §5.2/§7.4's "primary retrieval surface"), a horizontal
 * row of toggleable chips rather than web's dropdown Autocomplete (no room for one in the mobile
 * filter row, and the active-tag count is small enough that a scrollable row reads fine).
 * OR semantics within the selection, matching web's TagFilterSelect. Active tags only.
 */
export default function TagFilterBar({ value, onChange }: Props) {
  const { theme } = useAppTheme();
  const { data: tags = [] } = useQuery({
    queryKey: ['tags', 'autocomplete'],
    queryFn: () => listTags({ status: 'active', limit: 100 }),
    staleTime: 30_000,
  });

  if (tags.length === 0) return null;

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
      {tags.map((t) => {
        const active = value.includes(t.id);
        return (
          <Pressable
            key={t.id}
            onPress={() => toggle(t.id)}
            style={[
              styles.chip,
              { backgroundColor: active ? t.color : theme.colors.surfaceSecondary },
            ]}
          >
            <Text style={[styles.chipText, { color: active ? '#fff' : theme.colors.textSecondary }]}>
              {t.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, marginRight: 8 },
  chipText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 12.5 },
});
