/** TS-GRP-128: total owed to/from each person across every shared group. */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { getFriendBalances } from '../api/groups';
import { memberColor, initialsFromName } from './BalanceRow';

export default function FriendBalancesWidget() {
  const { theme } = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const { data } = useQuery({ queryKey: ['friend-balances'], queryFn: getFriendBalances });

  if (!data || data.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Balances with people</Text>
      {data.map((b) => {
        const owesYou = b.net > 0;
        const color = owesYou ? theme.colors.success : theme.colors.error;
        const label = owesYou
          ? `${b.counterparty_display_name} owes you $${b.net.toFixed(2)}`
          : `You owe ${b.counterparty_display_name} $${Math.abs(b.net).toFixed(2)}`;
        return (
          <View key={b.counterparty_email || b.counterparty_display_name} style={styles.row}>
            <View style={[styles.avatar, { backgroundColor: memberColor(b.counterparty_display_name) }]}>
              <Text style={styles.avatarText}>{initialsFromName(b.counterparty_display_name)}</Text>
            </View>
            <Text style={styles.label} numberOfLines={1}>{label}</Text>
            <Text style={styles.groupCount}>
              {b.groups.length} group{b.groups.length === 1 ? '' : 's'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderLight,
    },
    title: { fontFamily: 'Inter-Bold', fontSize: 15, color: theme.colors.text, marginBottom: 10 },
    row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    avatarText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 11 },
    label: { flex: 1, fontFamily: 'Inter-Regular', fontSize: 13, color: theme.colors.text },
    groupCount: { fontFamily: 'Inter-Regular', fontSize: 11, color: theme.colors.textSecondary },
  });
