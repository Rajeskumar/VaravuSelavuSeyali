import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { listMyCards, UserCardDTO } from '../../api/cards';
import { useCardCoachEnabled } from '../../hooks/useCardCoachEnabled';

interface Props {
  value: string | null; // card_id (card_catalog.id)
  onChange: (cardId: string | null) => void;
}

/**
 * TS-CARD-114 — optional "which card did I use" picker for the mobile add/edit expense flows.
 * Only offers cards the user has already added in the Cards tab (never the full catalog), and
 * renders nothing when there's nothing to pick from or Card Coach is off. Unset means "assume
 * my default card," matching CardRewardsEngine's fallback.
 */
export default function CardPickerField({ value, onChange }: Props) {
  const { theme } = useAppTheme();
  const { enabled: cardCoachEnabled } = useCardCoachEnabled();
  const [modalVisible, setModalVisible] = useState(false);
  const [cards, setCards] = useState<UserCardDTO[]>([]);

  useEffect(() => {
    if (!cardCoachEnabled) return;
    listMyCards().then(setCards).catch(() => setCards([]));
  }, [cardCoachEnabled]);

  if (!cardCoachEnabled || cards.length === 0) return null;

  const selected = cards.find((c) => c.card_id === value);

  return (
    <>
      <Pressable
        onPress={() => setModalVisible(true)}
        style={[styles.trigger, { borderColor: theme.colors.border }]}
      >
        <Text style={{ fontFamily: 'InstrumentSans-Regular', fontSize: 13, color: theme.colors.textSecondary }}>
          Card used
        </Text>
        <Text style={{ fontFamily: 'InstrumentSans-SemiBold', fontSize: 14, color: theme.colors.text }}>
          {selected ? selected.card_name : 'Default card'}
        </Text>
      </Pressable>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setModalVisible(false)} />
        <View style={[styles.sheet, theme.shadows.lg, { backgroundColor: theme.colors.surface }]}>
          <View style={[styles.pill, { backgroundColor: theme.colors.borderLight }]} />
          <View style={styles.header}>
            <Text style={{ fontFamily: 'InstrumentSans-Bold', fontSize: 18, color: theme.colors.text }}>Card used</Text>
            <Pressable onPress={() => setModalVisible(false)} hitSlop={8}>
              <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
            </Pressable>
          </View>
          <FlatList
            data={[{ id: '', card_id: '', card_name: 'Default card' } as UserCardDTO, ...cards]}
            keyExtractor={(c) => c.id || 'default'}
            style={{ maxHeight: 360 }}
            renderItem={({ item }) => {
              const isSelected = item.id ? item.card_id === value : !value;
              return (
                <Pressable
                  style={styles.row}
                  onPress={() => {
                    onChange(item.id ? item.card_id : null);
                    setModalVisible(false);
                  }}
                >
                  <Text style={[styles.rowText, { color: theme.colors.text }]}>{item.card_name}</Text>
                  {isSelected && <Ionicons name="checkmark" size={20} color={theme.colors.primary} />}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginTop: 12,
  },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32, maxHeight: '70%',
  },
  pill: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  rowText: { fontFamily: 'InstrumentSans-Regular', fontSize: 15 },
});
