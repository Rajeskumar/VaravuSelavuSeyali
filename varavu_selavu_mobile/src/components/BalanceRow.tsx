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
import { AppTheme } from '../theme';
import { MemberBalance } from '../api/groups';

interface Props {
  balance: MemberBalance;
  isCurrentUser?: boolean;
}

/** Derive a deterministic color from a member ID string. */
function memberColor(memberId: string): string {
  const COLORS = [
    '#007AFF', '#34C759', '#FF9500', '#AF52DE',
    '#FF2D55', '#5AC8FA', '#FFCC00', '#FF6B35',
  ];
  let hash = 0;
  for (let i = 0; i < memberId.length; i++) {
    hash = (hash * 31 + memberId.charCodeAt(i)) & 0xffff;
  }
  return COLORS[hash % COLORS.length];
}

export default function BalanceRow({ balance, isCurrentUser = false }: Props) {
  const { theme } = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const net = balance.net;
  const isPositive = net > 0;
  const isNegative = net < 0;

  const netColor = isPositive
    ? theme.colors.success ?? '#34C759'
    : isNegative
    ? theme.colors.error
    : theme.colors.textTertiary;

  const netLabel = isPositive
    ? `Gets back $${net.toFixed(2)}`
    : isNegative
    ? `Owes $${Math.abs(net).toFixed(2)}`
    : 'Settled up';

  const initials = balance.display_name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

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
        {isPositive ? '+' : isNegative ? '-' : ''}${Math.abs(net).toFixed(2)}
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
    avatarText: {
      color: '#fff',
      fontFamily: 'Inter-Bold',
      fontSize: 15,
    },
    info: { flex: 1 },
    name: {
      fontFamily: 'Inter-SemiBold',
      fontSize: 15,
      color: theme.colors.text,
    },
    youBadge: {
      fontFamily: 'Inter-Regular',
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    netLabel: {
      fontFamily: 'Inter-Regular',
      fontSize: 13,
      marginTop: 2,
    },
    netAmount: {
      fontFamily: 'Inter-Bold',
      fontSize: 16,
    },
  });
