import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../context/ThemeContext';
import { TagRefDTO } from '../../api/tags';

interface Props {
  tags?: TagRefDTO[];
  size?: 'small' | 'medium';
}

/** Read-only colored tag chips — TS-TAG-112. Renders nothing when there are no tags, so
 * callers can drop it in unconditionally without an extra `tags.length > 0 &&` guard. */
export default function TagChipsDisplay({ tags, size = 'medium' }: Props) {
  const { theme } = useAppTheme();
  if (!tags || tags.length === 0) return null;
  const small = size === 'small';

  return (
    <View style={styles.row}>
      {tags.map((t) => (
        <View
          key={t.id}
          style={[
            styles.chip,
            small && styles.chipSmall,
            { backgroundColor: t.color },
          ]}
        >
          <Text style={[styles.chipText, small && styles.chipTextSmall]} numberOfLines={1}>
            {t.name}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  chipSmall: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  chipText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 12, color: '#fff' },
  chipTextSmall: { fontSize: 10.5 },
});
