import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, withAlpha } from '../theme';
import { categoryCode, categoryTone } from '../utils/categoryCode';

interface ListRowProps {
  /** Category name — drives the mono three-letter code and its tint. Omit when passing `leading`. */
  category?: string | null;
  /** Custom left tile (avatar, group initial…) replacing the category code tile. */
  leading?: React.ReactNode;
  title: string;
  meta?: string;
  amount?: string;
  amountColor?: string;
  /** Small second line under the amount, e.g. "you +$38.51". */
  sub?: string;
  subColor?: string;
  /** Replaces the amount column entirely (e.g. a switch). */
  trailing?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  hideDivider?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * V2's single row primitive — expenses, group expenses, recurring, activity and group lists all
 * render through this: 36px tinted tile with a mono category code, title + meta, amount column,
 * separated by a hairline instead of sitting in a card.
 */
export default function ListRow({
  category, leading, title, meta, amount, amountColor, sub, subColor, trailing,
  onPress, onLongPress, hideDivider, style,
}: ListRowProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const tone = categoryTone(category);

  const body = (
    <View style={[styles.row, hideDivider && styles.noDivider, style]}>
      {leading ?? (
        <View style={[styles.tile, { backgroundColor: withAlpha(tone, 0.14) }]}>
          <Text style={[styles.code, { color: tone }]}>{categoryCode(category)}</Text>
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {meta ? <Text style={styles.meta} numberOfLines={1}>{meta}</Text> : null}
      </View>
      {trailing ?? (amount !== undefined && (
        <View style={styles.right}>
          <Text style={[styles.amount, amountColor ? { color: amountColor } : null]}>{amount}</Text>
          {sub ? <Text style={[styles.sub, { color: subColor ?? theme.colors.textTertiary }]}>{sub}</Text> : null}
        </View>
      ))}
    </View>
  );

  if (!onPress && !onLongPress) return body;
  return (
    <TouchableOpacity activeOpacity={0.6} onPress={onPress} onLongPress={onLongPress}>
      {body}
    </TouchableOpacity>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  noDivider: { borderBottomWidth: 0 },
  tile: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  code: { fontFamily: theme.typography.fontFamily.mono, fontSize: 12 },
  body: { flex: 1, minWidth: 0 },
  title: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 15, color: theme.colors.text, letterSpacing: -0.1 },
  meta: { fontFamily: theme.typography.fontFamily.regular, fontSize: 12, color: theme.colors.textTertiary, marginTop: 2 },
  right: { alignItems: 'flex-end' },
  amount: {
    fontFamily: theme.typography.fontFamily.semiBold, fontSize: 15, color: theme.colors.text,
    fontVariant: ['tabular-nums'],
  },
  sub: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 11, marginTop: 2 },
});
