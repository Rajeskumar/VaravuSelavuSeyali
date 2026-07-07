/**
 * GroupsScreen.tsx — Lists the user's groups.
 *
 * Feature-flag gate: if the backend returns 404 for /groups, shows a
 * "coming soon" placeholder consistent with the web GroupsPage.
 *
 * Navigation: tap a group → GroupDetailScreen
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  listGroups,
  createGroup,
  ApiError,
  GroupSummary,
} from '../api/groups';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import ScreenWrapper from '../components/ScreenWrapper';
import { showToast } from '../components/Toast';

const GROUP_TYPE_OPTIONS = ['other', 'trip', 'home', 'couple'] as const;
type GroupTypeOption = typeof GROUP_TYPE_OPTIONS[number];

const GROUP_TYPE_EMOJI: Record<GroupTypeOption, string> = {
  other: '👥',
  trip: '✈️',
  home: '🏠',
  couple: '💑',
};

export default function GroupsScreen() {
  const { theme } = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<GroupTypeOption>('other');

  const { data, isLoading, isRefetching, error, refetch } = useQuery({
    queryKey: ['groups'],
    queryFn: listGroups,
    retry: (count, err) => {
      // Don't retry on 404 — it means the feature flag is off
      if (err instanceof ApiError && err.status === 404) return false;
      return count < 2;
    },
  });

  const createMut = useMutation({
    mutationFn: () => createGroup({ name: newName.trim(), group_type: newType }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      setShowCreate(false);
      setNewName('');
      setNewType('other');
      navigation.navigate('GroupDetail', { groupId: created.group_id });
    },
    onError: (e: any) => {
      showToast({ message: e.message ?? 'Failed to create group', type: 'error' });
    },
  });

  // Feature flag: backend returns 404 when GROUPS_ENABLED=false
  const notEnabled = error instanceof ApiError && error.status === 404;

  if (notEnabled) {
    return (
      <ScreenWrapper>
        <View style={styles.emptyCenter}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyTitle}>Groups isn't available yet</Text>
          <Text style={styles.emptySubtitle}>
            This feature is being rolled out — check back soon.
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  const groups: GroupSummary[] = data ?? [];

  const renderItem = ({ item }: { item: GroupSummary }) => {
    const emoji = GROUP_TYPE_EMOJI[item.group_type as GroupTypeOption] ?? '👥';
    const balanceColor =
      item.my_balance > 0
        ? theme.colors.success ?? '#34C759'
        : item.my_balance < 0
        ? theme.colors.error
        : theme.colors.textTertiary;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('GroupDetail', { groupId: item.group_id })}
      >
        <View style={styles.cardIcon}>
          <Text style={styles.cardEmoji}>{emoji}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.cardMeta}>
            {item.member_count} member{item.member_count !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={[styles.balanceAmount, { color: balanceColor }]}>
            {item.my_balance > 0
              ? `+$${item.my_balance.toFixed(2)}`
              : item.my_balance < 0
              ? `-$${Math.abs(item.my_balance).toFixed(2)}`
              : '$0.00'}
          </Text>
          <Text style={styles.balanceLabel}>
            {item.my_balance > 0
              ? 'you are owed'
              : item.my_balance < 0
              ? 'you owe'
              : 'settled'}
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={theme.colors.textTertiary}
        />
      </TouchableOpacity>
    );
  };

  return (
    <ScreenWrapper>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color={theme.colors.primary} />
        </TouchableOpacity>
        <Text style={styles.heading}>👥 Groups</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowCreate(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.emptyCenter}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyTitle}>No groups yet</Text>
          <Text style={styles.emptySubtitle}>
            Create a group to split rent, trips, or shared bills.
          </Text>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => setShowCreate(true)}
          >
            <Text style={styles.createBtnText}>Create Group</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.group_id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={theme.colors.primary}
            />
          }
        />
      )}

      {/* Create Group Modal */}
      <Modal
        visible={showCreate}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreate(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowCreate(false)}
        />
        <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={styles.modalPill} />
          <Text style={styles.modalTitle}>New Group</Text>

          <TextInput
            style={styles.input}
            placeholder="Group name (e.g., Apartment 4B)"
            placeholderTextColor={theme.colors.textTertiary}
            value={newName}
            onChangeText={setNewName}
            autoFocus
            maxLength={80}
          />

          <Text style={styles.typeLabel}>Type</Text>
          <View style={styles.typeRow}>
            {GROUP_TYPE_OPTIONS.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.typeBtn, newType === t && styles.typeBtnActive]}
                onPress={() => setNewType(t)}
              >
                <Text style={styles.typeEmoji}>{GROUP_TYPE_EMOJI[t]}</Text>
                <Text style={[styles.typeBtnLabel, newType === t && styles.typeBtnLabelActive]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.createBtn, (!newName.trim() || createMut.isPending) && styles.createBtnDisabled]}
            onPress={() => createMut.mutate()}
            disabled={!newName.trim() || createMut.isPending}
          >
            {createMut.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.createBtnText}>Create</Text>
            )}
          </TouchableOpacity>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    backBtn: {
      padding: 4,
      marginRight: 4,
    },
    heading: {
      flex: 1,
      fontFamily: 'Inter-Bold',
      fontSize: 28,
      color: theme.colors.text,
    },
    addBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    emptyIcon: { fontSize: 64, marginBottom: 16 },
    emptyTitle: {
      fontFamily: 'Inter-Bold',
      fontSize: 20,
      color: theme.colors.text,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontFamily: 'Inter-Regular',
      fontSize: 15,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 24,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      marginHorizontal: 16,
      marginTop: 10,
      borderRadius: 14,
      padding: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderLight,
    },
    cardIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.surfaceSecondary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    cardEmoji: { fontSize: 22 },
    cardBody: { flex: 1 },
    cardName: {
      fontFamily: 'Inter-SemiBold',
      fontSize: 16,
      color: theme.colors.text,
    },
    cardMeta: {
      fontFamily: 'Inter-Regular',
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    cardRight: { alignItems: 'flex-end', marginRight: 8 },
    balanceAmount: { fontFamily: 'Inter-Bold', fontSize: 15 },
    balanceLabel: {
      fontFamily: 'Inter-Regular',
      fontSize: 11,
      color: theme.colors.textTertiary,
      marginTop: 1,
    },
    // Create modal
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    modalSheet: {
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingTop: 12,
      gap: 12,
    },
    modalPill: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.borderLight,
      alignSelf: 'center',
      marginBottom: 8,
    },
    modalTitle: {
      fontFamily: 'Inter-Bold',
      fontSize: 20,
      color: theme.colors.text,
      textAlign: 'center',
    },
    input: {
      backgroundColor: theme.colors.surfaceSecondary,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontFamily: 'Inter-Regular',
      fontSize: 16,
      color: theme.colors.text,
    },
    typeLabel: {
      fontFamily: 'Inter-SemiBold',
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    typeRow: { flexDirection: 'row', gap: 8 },
    typeBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: theme.colors.borderLight,
    },
    typeBtnActive: {
      borderColor: theme.colors.primary,
      backgroundColor: `${theme.colors.primary}18`,
    },
    typeEmoji: { fontSize: 22, marginBottom: 4 },
    typeBtnLabel: {
      fontFamily: 'Inter-Regular',
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    typeBtnLabelActive: {
      color: theme.colors.primary,
      fontFamily: 'Inter-SemiBold',
    },
    createBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    createBtnDisabled: { opacity: 0.5 },
    createBtnText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 16 },
  });
