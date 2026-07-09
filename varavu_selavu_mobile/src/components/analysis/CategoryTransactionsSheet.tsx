import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { AppTheme } from '../../theme';
import ExpenseCard from '../ExpenseCard';

export interface CategoryTransaction {
  date: string;
  description: string;
  category: string;
  cost: number;
}

interface CategoryTransactionsSheetProps {
  visible: boolean;
  category: string | null;
  transactions: CategoryTransaction[];
  onClose: () => void;
}

export function CategoryTransactionsSheet({
  visible,
  category,
  transactions,
  onClose,
}: CategoryTransactionsSheetProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{category} Transactions</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {transactions.length === 0 ? (
            <Text style={styles.emptyText}>No transactions found.</Text>
          ) : (
            transactions.map((tx, idx) => (
              <ExpenseCard
                key={`tx-${idx}`}
                description={tx.description}
                category={tx.category}
                cost={tx.cost}
                date={tx.date}
              />
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    maxHeight: '80%',
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    textTransform: 'capitalize',
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    paddingHorizontal: 20,
  },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.textSecondary,
    marginTop: 20,
    fontSize: 15,
  },
});
