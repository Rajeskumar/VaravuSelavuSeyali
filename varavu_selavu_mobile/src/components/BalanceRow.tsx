/**
 * BalanceRow.tsx — Displays a single member's net balance in a group.
 *
 * Positive net = they are owed money (shown in green).
 * Negative net = they owe money (shown in red/error).
 * Zero = settled up (shown in secondary text color).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, inkOnPastel } from '../theme';
import { MemberBalance } from '../api/groups';
import { formatCurrency } from '../utils/currencyMath';

interface Props {
  balance: MemberBalance;
  isCurrentUser?: boolean;
}

/** Derive a deterministic color from a member ID string. Same violet/cyan-anchored ramp as
 * the web app's `GroupAvatar.tsx`/`categoryColors.ts`, for a consistent palette family. */
export function memberColor(memberId: string): string {
  const COLORS = [
    // V2 avatar sequence — violet, cyan, amber, green, pink, deep violet (no red: red means "owes").
    '#AEA5FF', '#00E0E0', '#FBBF24', '#4ADE80', '#EF8BC5', '#7C72E8',
  ];
  let hash = 0;
  for (let i = 0; i < memberId.length; i++) {
    hash = (hash * 31 + memberId.charCodeAt(i)) & 0xffff;
  }
  return COLORS[hash % COLORS.length];
}

/** Up to 2 initials from a display name, e.g. "Group Tester" -> "GT". */
export function initialsFromName(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function BalanceRow({ balance, isCurrentUser = false }: Props) {
  const { theme } = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const net = balance.net;
  const isPositive = net > 0;
  const isNegative = net < 0;

  const netColor = isPositive
    ? theme.colors.success
    : isNegative
    ? theme.colors.error
    : theme.colors.textTertiary;

  const netLabel = isPositive
    ? `Gets back ${formatCurrency(net)}`
    : isNegative
    ? `Owes ${formatCurrency(Math.abs(net))}`
    : 'Settled up';

  const initials = initialsFromName(balance.display_name);

  return (
    <View style={[styles.row, isCurrentUser && styles.rowHighlighted]}>
      <View style={[styles.avatar, { backgroundColor: memberColor(balance.member_id) }]}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {balance.display_name}
          {isCurrentUser && <Text style={styles.youBadge}> (you)</Text>}
        </Text>
        <Text style={[styles.netLabel, { color: netColor }]}>{netLabel}</Text>
      </View>
      <Text style={[styles.netAmount, { color: netColor }]}>
        {isPositive ? '+' : isNegative ? '-' : ''}{formatCurrency(Math.abs(net))}
      </Text>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.borderLight,
    },
    rowHighlighted: {
      backgroundColor: theme.colors.surfaceSecondary,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    // CerebroOS's avatar palette (memberColor()) is a set of light pastel tints, fixed in both
    // modes — ink text clears WCAG AA against all of them (5.6-11.7:1); using the mode-aware
    // `textInverse` here would go wrong in light mode (it flips to white, ~under 4:1).
    avatarText: {
      color: inkOnPastel,
      fontFamily: 'InstrumentSans-Bold',
      fontSize: 15,
    },
    info: { flex: 1 },
    name: {
      fontFamily: 'InstrumentSans-SemiBold',
      fontSize: 15,
      color: theme.colors.text,
    },
    youBadge: {
      fontFamily: 'InstrumentSans-Regular',
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    netLabel: {
      fontFamily: 'InstrumentSans-Regular',
      fontSize: 13,
      marginTop: 2,
    },
    netAmount: {
      fontFamily: 'InstrumentSans-Bold',
      fontSize: 16,
    },
  });
