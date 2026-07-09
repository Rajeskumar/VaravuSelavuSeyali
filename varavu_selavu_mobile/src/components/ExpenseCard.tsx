import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import Card from './Card';
import { formatCurrency } from '../utils/currencyMath';

const categoryEmojis: Record<string, string> = {
  food: '🍕', groceries: '🛒', transport: '🚗', entertainment: '🎬',
  shopping: '🛍️', health: '🏥', utilities: '💡', rent: '🏠',
  travel: '✈️', education: '📚', subscription: '📱', other: '📋',
};

function getCategoryEmoji(category: string): string {
  return categoryEmojis[category?.toLowerCase().trim()] || '💳';
}

interface ExpenseCardProps {
  description: string;
  category: string;
  cost: number;
  date: string;
  merchantName?: string | null;
  // Group specific props
  paidByNames?: string;
  myShare?: number;
  currency?: string | null;
  groupCurrency?: string | null;
  
  // Actions
  onPress?: () => void; // Used for "View" action (like opening detail sheet)
  onEdit?: () => void;
  onMove?: () => void;
  onDelete?: () => void;
  
  // Config
  showMoveButton?: boolean;
}

export default function ExpenseCard({
  description,
  category,
  cost,
  date,
  merchantName,
  paidByNames,
  myShare,
  currency,
  groupCurrency,
  onPress,
  onEdit,
  onMove,
  onDelete,
  showMoveButton = false,
}: ExpenseCardProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const currencyStr = currency && currency !== groupCurrency ? ` · ${currency}` : '';

  const content = (
    <View style={styles.cardRow}>
      {/* Category Icon */}
      <View style={styles.iconContainer}>
        <Text style={styles.iconText}>{getCategoryEmoji(category)}</Text>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.desc} numberOfLines={1}>{description}</Text>
        <View style={styles.metaRow}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{category}</Text>
          </View>
          {merchantName ? (
            <View style={styles.merchantBadge}>
              <Text style={styles.merchantText}>🏪 {merchantName}</Text>
            </View>
          ) : null}
          <Text style={styles.dateText}>{date}</Text>
        </View>
        {paidByNames && (
          <Text style={styles.groupMeta}>
            paid by {paidByNames}{currencyStr}
          </Text>
        )}
      </View>

      {/* Cost & Actions */}
      <View style={styles.cardRight}>
        <Text style={styles.cost}>-{formatCurrency(cost)}</Text>
        {myShare !== undefined && (
          <Text style={styles.shareText}>my expense: {formatCurrency(myShare)}</Text>
        )}
        <View style={styles.actions}>
          {onEdit && (
            <TouchableOpacity onPress={onEdit} style={styles.actionBtn} activeOpacity={0.7}>
              <Text style={styles.actionIcon}>✏️</Text>
            </TouchableOpacity>
          )}
          {showMoveButton && onMove && (
            <TouchableOpacity onPress={onMove} style={styles.actionBtn} activeOpacity={0.7}>
              <Text style={styles.actionIcon}>🔀</Text>
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity
              onPress={onDelete}
              style={[styles.actionBtn, styles.deleteBtn]}
              activeOpacity={0.7}
            >
              <Text style={styles.actionIcon}>🗑️</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <Card style={styles.card}>
      {onPress ? (
        <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
          {content}
        </TouchableOpacity>
      ) : (
        content
      )}
    </Card>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  card: {
    marginBottom: 10,
    padding: 16,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 22,
  },
  info: {
    flex: 1,
    marginLeft: 14,
  },
  desc: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  categoryBadge: {
    backgroundColor: theme.colors.primarySurface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.primary,
    textTransform: 'capitalize',
  },
  merchantBadge: {
    backgroundColor: theme.colors.primarySurface,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  merchantText: {
    fontSize: 11,
    fontWeight: '500',
    color: theme.colors.primary,
  },
  dateText: {
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  groupMeta: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 6,
  },
  cardRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  cost: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  shareText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    backgroundColor: theme.colors.errorSurface,
  },
  actionIcon: {
    fontSize: 14,
  },
});
