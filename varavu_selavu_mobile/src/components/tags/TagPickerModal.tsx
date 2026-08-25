import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import CustomButton from '../CustomButton';
import { listTags, TagDTO } from '../../api/tags';

interface Props {
  visible: boolean;
  /** Tag names currently applied, in their original casing. */
  value: string[];
  onChange: (names: string[]) => void;
  onClose: () => void;
}

/**
 * TS-TAG-112 — mobile's reduced-scope tag editor: pick from EXISTING active tags only, no
 * inline creation (PRD §11.2 — creation stays web-only in v1). A tap-to-toggle list rather than
 * web's chip-plus-typeahead `TagInput`, since there's no MUI Autocomplete equivalent on RN and
 * the full tag list is expected to be short enough to just scroll.
 */
export default function TagPickerModal({ visible, value, onChange, onClose }: Props) {
  const { theme } = useAppTheme();
  const [tags, setTags] = useState<TagDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) return;
    setSelected(new Set(value.map((n) => n.toLowerCase())));
    setLoading(true);
    listTags({ status: 'active', limit: 100 })
      .then(setTags)
      .catch(() => setTags([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = name.toLowerCase();
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDone = () => {
    // Preserve each tag's real casing from the fetched list rather than the lowercased key.
    const names = tags.filter((t) => selected.has(t.name.toLowerCase())).map((t) => t.name);
    onChange(names);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, theme.shadows.lg, { backgroundColor: theme.colors.surface }]}>
        <View style={[styles.pill, { backgroundColor: theme.colors.borderLight }]} />
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Tags</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 24 }} />
        ) : tags.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
            No tags yet — create one on the web app first.
          </Text>
        ) : (
          <FlatList
            data={tags}
            keyExtractor={(t) => t.id}
            style={{ maxHeight: 360 }}
            renderItem={({ item }) => {
              const checked = selected.has(item.name.toLowerCase());
              return (
                <Pressable style={styles.row} onPress={() => toggle(item.name)}>
                  <View style={[styles.dot, { backgroundColor: item.color }]} />
                  <Text style={[styles.rowText, { color: theme.colors.text }]}>{item.name}</Text>
                  {checked && <Ionicons name="checkmark" size={20} color={theme.colors.primary} />}
                </Pressable>
              );
            }}
          />
        )}

        <CustomButton title="Done" onPress={handleDone} style={{ marginTop: 16 }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: '80%',
  },
  pill: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontFamily: 'InstrumentSans-Bold', fontSize: 18 },
  emptyText: { fontFamily: 'InstrumentSans-Regular', fontSize: 14, marginVertical: 24, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1, fontFamily: 'InstrumentSans-Regular', fontSize: 15 },
});
