import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { getGroupActivity, GroupDetail, GroupActivityDTO } from '../api/groups';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { memberColor } from './BalanceRow';

interface ActivityListProps {
  groupId: string;
  group: GroupDetail;
}

export default function ActivityList({ groupId, group }: ActivityListProps) {
  const { theme } = useAppTheme();
  const { data, isLoading, error } = useQuery({
    queryKey: ['group-activity', groupId],
    queryFn: () => getGroupActivity(groupId, 50, 0),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={[styles.errorText, { color: theme.colors.error }]}>Failed to load activity.</Text>
      </View>
    );
  }

  if (data.items.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="time-outline" size={48} color={theme.colors.textSecondary} />
        <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>No activity yet.</Text>
      </View>
    );
  }

  const nameFor = (memberId: string | null) => {
    if (!memberId) return 'Someone';
    return group.members.find((m) => m.member_id === memberId)?.display_name || 'A member';
  };

  const getActionInfo = (item: GroupActivityDTO) => {
    const p = item.payload || {};
    const actor = nameFor(item.actor_member_id);
    
    switch (item.action) {
      case 'group_created':
        return { icon: 'add-circle-outline' as const, color: theme.colors.primary, text: `${actor} created the group.` };
      case 'group_updated':
        return { icon: 'settings-outline' as const, color: theme.colors.textSecondary, text: `${actor} updated the group settings.` };
      case 'expense_created':
      case 'itemized_expense_created':
        return { icon: 'receipt-outline' as const, color: theme.colors.primary, text: `${actor} added an expense: "${p.description}" for $${p.amount?.toFixed(2) || '0.00'}.` };
      case 'expense_updated':
        return { icon: 'receipt-outline' as const, color: theme.colors.warning, text: `${actor} updated the expense "${p.description}".` };
      case 'expense_deleted':
        return { icon: 'receipt-outline' as const, color: theme.colors.error, text: `${actor} deleted the expense "${p.description}".` };
      case 'member_added':
      case 'member_joined':
        return { icon: 'person-add-outline' as const, color: theme.colors.success, text: `${p.display_name} joined the group.` };
      case 'member_removed':
      case 'member_left':
        return { icon: 'person-remove-outline' as const, color: theme.colors.error, text: `${p.display_name} left the group.` };
      case 'settlement_created':
        return { icon: 'hand-left-outline' as const, color: theme.colors.success, text: `${actor} recorded a settlement of $${p.amount?.toFixed(2) || '0.00'}.` };
      case 'settlement_deleted':
        return { icon: 'hand-left-outline' as const, color: theme.colors.textSecondary, text: `${actor} deleted a settlement.` };
      default:
        return { icon: 'time-outline' as const, color: theme.colors.textSecondary, text: `${actor} performed an action.` };
    }
  };

  const renderItem = ({ item }: { item: GroupActivityDTO }) => {
    const { icon, color, text } = getActionInfo(item);
    const date = new Date(item.created_at);
    const isToday = new Date().toDateString() === date.toDateString();
    const timeStr = isToday ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    
    const avatarColor = item.actor_member_id ? memberColor(item.actor_member_id) : theme.colors.border;
    const actorName = nameFor(item.actor_member_id);
    const initials = actorName.charAt(0).toUpperCase();

    return (
      <View style={[styles.card, { borderColor: theme.colors.borderLight }]}>
        <View style={[styles.iconContainer, { backgroundColor: theme.colors.surfaceSecondary }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <View style={styles.content}>
          <Text style={[styles.text, { color: theme.colors.text }]}>{text}</Text>
          <Text style={[styles.time, { color: theme.colors.textSecondary }]}>{timeStr}</Text>
        </View>
        {item.actor_member_id && (
          <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <FlatList
      data={data.items}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
  },
  emptyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    marginTop: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  text: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
  },
  time: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    marginTop: 4,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
