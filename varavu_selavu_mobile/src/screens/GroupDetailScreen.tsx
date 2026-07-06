/**
 * GroupDetailScreen.tsx — Two-tab screen for a single group.
 *
 * Tab 1 (Expenses): list of group expenses, each showing the user's share.
 * Tab 2 (Balances): BalanceRow list + "Settle Up" button.
 *
 * Scope note (TS-GRP-109): Stats and Activity tabs are listed in §12.2 as
 * optional for Phase 1 — omitted here, to be added in a follow-up.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  getGroupDetail,
  listGroupExpenses,
  getGroupBalances,
  addMember,
  createInvite,
  GroupExpenseRow,
  MemberBalance,
  MemberDTO,
  ApiError,
} from '../api/groups';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import BalanceRow, { memberColor } from '../components/BalanceRow';
import SettleUpSheet from '../components/SettleUpSheet';
import { showToast } from '../components/Toast';

type Tab = 'expenses' | 'balances';

const GROUP_TYPE_EMOJI: Record<string, string> = {
  other: '👥',
  trip: '✈️',
  home: '🏠',
  couple: '💑',
};

export default function GroupDetailScreen() {
  const { theme } = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { userEmail } = useAuth();
  const qc = useQueryClient();

  const groupId: string = route.params?.groupId ?? '';

  const [activeTab, setActiveTab] = useState<Tab>('expenses');
  const [settleUpVisible, setSettleUpVisible] = useState(false);
  const [settleFrom, setSettleFrom] = useState<string | null>(null);
  const [settleTo, setSettleTo] = useState<string | null>(null);
  const [settleSuggested, setSettleSuggested] = useState(0);

  // Invite dialog state
  const [inviteVisible, setInviteVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

  const {
    data: detail,
    isLoading: detailLoading,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['group-detail', groupId],
    queryFn: () => getGroupDetail(groupId),
    enabled: !!groupId,
  });

  const {
    data: expenseData,
    isLoading: expensesLoading,
    isRefetching: expensesRefetching,
    refetch: refetchExpenses,
  } = useQuery({
    queryKey: ['group-expenses', groupId],
    queryFn: () => listGroupExpenses(groupId, 0, 50),
    enabled: !!groupId,
  });

  const {
    data: balanceData,
    isLoading: balancesLoading,
    isRefetching: balancesRefetching,
    refetch: refetchBalances,
  } = useQuery({
    queryKey: ['group-balances', groupId],
    queryFn: () => getGroupBalances(groupId),
    enabled: !!groupId,
  });

  const members: MemberDTO[] = detail?.members ?? [];
  const expenses: GroupExpenseRow[] = expenseData?.items ?? [];
  const balances: MemberBalance[] = balanceData?.members ?? [];

  // Find current user's member ID (may be null for placeholder members)
  const myMember = members.find((m) => m.user_email === userEmail);
  const myBalance = balances.find((b) => b.member_id === myMember?.member_id)?.net ?? 0;
  const balanceColor =
    myBalance > 0 ? (theme.colors.success ?? '#34C759') : myBalance < 0 ? theme.colors.error : theme.colors.textSecondary;
  const balanceLabel =
    myBalance > 0 ? `You're owed $${myBalance.toFixed(2)}` : myBalance < 0 ? `You owe $${Math.abs(myBalance).toFixed(2)}` : "You're all settled up";

  const handleSettleUp = (balance: MemberBalance) => {
    if (!myMember) return;
    // If the current user owes this person (net from their perspective is negative)
    if (balance.net < 0 && balance.member_id !== myMember.member_id) {
      // This member owes the current user → current user is "from"? No:
      // net < 0 means this member owes money. We're settling for the current user.
      // Simple approach: pre-fill with "my" debt to this member.
      setSettleFrom(myMember.member_id);
      setSettleTo(balance.member_id);
      setSettleSuggested(Math.abs(balance.net));
    } else {
      setSettleFrom(balance.member_id);
      setSettleTo(myMember.member_id);
      setSettleSuggested(Math.abs(balance.net));
    }
    setSettleUpVisible(true);
  };

  const handleAddMember = async () => {
    setInviteLoading(true);
    try {
      const newMember = await addMember(groupId, inviteEmail.trim() || undefined, inviteName.trim() || undefined);
      // If they have an email, also create an invite link
      if (inviteEmail.trim()) {
        try {
          const invite = await createInvite(groupId, newMember.member_id);
          Alert.alert('Invite link', invite.url);
        } catch { /* invite link creation is best-effort */ }
      }
      showToast({ message: 'Member added', type: 'success' });
      qc.invalidateQueries({ queryKey: ['group-detail', groupId] });
      setInviteVisible(false);
      setInviteEmail('');
      setInviteName('');
    } catch (e: any) {
      showToast({ message: e.message ?? 'Failed to add member', type: 'error' });
    } finally {
      setInviteLoading(false);
    }
  };

  if (detailLoading) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.loadingCenter}>
        <Text style={styles.errorText}>Group not found.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderExpense = ({ item }: { item: GroupExpenseRow }) => {
    const payerNames = item.payer_summary
      .map((p) => members.find((m) => m.member_id === p.member_id)?.display_name ?? '?')
      .join(', ');

    return (
      <View style={styles.expenseCard}>
        <View style={styles.expenseIcon}>
          <Ionicons name="receipt-outline" size={18} color={theme.colors.textSecondary} />
        </View>
        <View style={styles.expenseLeft}>
          <Text style={styles.expenseDesc} numberOfLines={1}>
            {item.description}
          </Text>
          <Text style={styles.expenseMeta}>
            {item.date} · paid by {payerNames}
          </Text>
        </View>
        <View style={styles.expenseRight}>
          <Text style={styles.expenseTotal}>${item.cost.toFixed(2)}</Text>
          <Text style={styles.expenseShare}>your share ${item.my_share.toFixed(2)}</Text>
        </View>
      </View>
    );
  };

  const renderBalance = ({ item }: { item: MemberBalance }) => (
    <TouchableOpacity
      onPress={() => {
        if (item.net !== 0) handleSettleUp(item);
      }}
      activeOpacity={item.net !== 0 ? 0.7 : 1}
    >
      <BalanceRow balance={item} isCurrentUser={item.member_id === myMember?.member_id} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
        <View style={styles.groupIcon}>
          <Text style={styles.groupIconEmoji}>{GROUP_TYPE_EMOJI[detail.group_type] ?? '👥'}</Text>
        </View>
        <Text style={styles.groupName} numberOfLines={1}>
          {detail.name}
        </Text>
        <TouchableOpacity
          style={styles.inviteBtn}
          onPress={() => setInviteVisible(true)}
        >
          <Ionicons name="person-add" size={20} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Balance summary */}
      <View style={styles.balanceBanner}>
        <Text style={styles.balanceBannerLabel}>Your balance in this group</Text>
        <Text style={[styles.balanceBannerAmount, { color: balanceColor }]}>{balanceLabel}</Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['expenses', 'balances'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      {activeTab === 'expenses' ? (
        expensesLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : expenses.length === 0 ? (
          <View style={styles.emptyCenter}>
            <Text style={styles.emptyText}>No expenses yet.</Text>
            <Text style={styles.emptySubText}>
              Use the + button in the main screen to add a group expense.
            </Text>
          </View>
        ) : (
          <FlatList
            data={expenses}
            keyExtractor={(item) => item.row_id}
            renderItem={renderExpense}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            refreshControl={
              <RefreshControl
                refreshing={expensesRefetching}
                onRefresh={refetchExpenses}
                tintColor={theme.colors.primary}
              />
            }
          />
        )
      ) : balancesLoading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <>
          <FlatList
            data={balances}
            keyExtractor={(item) => item.member_id}
            renderItem={renderBalance}
            contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
            refreshControl={
              <RefreshControl
                refreshing={balancesRefetching}
                onRefresh={refetchBalances}
                tintColor={theme.colors.primary}
              />
            }
          />
          {/* Settle Up FAB */}
          <TouchableOpacity
            style={[styles.settleBtn, { bottom: insets.bottom + 16 }]}
            onPress={() => {
              setSettleFrom(null);
              setSettleTo(null);
              setSettleSuggested(0);
              setSettleUpVisible(true);
            }}
          >
            <Text style={styles.settleBtnText}>Settle Up</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Settle Up Sheet */}
      <SettleUpSheet
        visible={settleUpVisible}
        groupId={groupId}
        members={members}
        balances={balances}
        fromMemberId={settleFrom}
        toMemberId={settleTo}
        suggestedAmount={settleSuggested}
        onClose={() => setSettleUpVisible(false)}
        onSettled={() => {
          qc.invalidateQueries({ queryKey: ['group-balances', groupId] });
          qc.invalidateQueries({ queryKey: ['group-expenses', groupId] });
        }}
      />

      {/* Add member modal */}
      <Modal
        visible={inviteVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setInviteVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setInviteVisible(false)} />
        <View style={[styles.inviteSheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={styles.modalPill} />
          <Text style={styles.inviteTitle}>Add Member</Text>
          <TextInput
            style={styles.input}
            placeholder="Email (links to registered account)"
            placeholderTextColor={theme.colors.textTertiary}
            value={inviteEmail}
            onChangeText={setInviteEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Display name (for placeholder members)"
            placeholderTextColor={theme.colors.textTertiary}
            value={inviteName}
            onChangeText={setInviteName}
          />
          <TouchableOpacity
            style={[styles.createBtn, (!inviteEmail.trim() && !inviteName.trim()) && styles.createBtnDisabled]}
            onPress={handleAddMember}
            disabled={inviteLoading || (!inviteEmail.trim() && !inviteName.trim())}
          >
            {inviteLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.createBtnText}>Add & Create Invite</Text>
            )}
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    errorText: { fontFamily: 'Inter-Regular', fontSize: 16, color: theme.colors.error },
    backLink: { color: theme.colors.primary, fontFamily: 'Inter-SemiBold', marginTop: 12 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.borderLight,
    },
    backBtn: { marginRight: 8, padding: 4 },
    groupIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: theme.colors.primarySurface,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    groupIconEmoji: { fontSize: 17 },
    groupName: {
      flex: 1,
      fontFamily: 'Inter-Bold',
      fontSize: 18,
      color: theme.colors.text,
    },
    inviteBtn: { padding: 4 },
    balanceBanner: {
      marginHorizontal: 16,
      marginTop: 12,
      padding: 16,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderLight,
    },
    balanceBannerLabel: {
      fontFamily: 'Inter-Regular',
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginBottom: 2,
    },
    balanceBannerAmount: {
      fontFamily: 'Inter-Bold',
      fontSize: 20,
    },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: theme.colors.surfaceSecondary,
      margin: 16,
      borderRadius: 12,
      padding: 4,
    },
    tabItem: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: 9,
    },
    tabItemActive: {
      backgroundColor: theme.colors.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderLight,
    },
    tabLabel: {
      fontFamily: 'Inter-SemiBold',
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    tabLabelActive: { color: theme.colors.primary },
    emptyCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    emptyText: {
      fontFamily: 'Inter-SemiBold',
      fontSize: 18,
      color: theme.colors.text,
      textAlign: 'center',
    },
    emptySubText: {
      fontFamily: 'Inter-Regular',
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginTop: 8,
    },
    expenseCard: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.borderLight,
    },
    expenseIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: theme.colors.surfaceSecondary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    expenseLeft: { flex: 1 },
    expenseDesc: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: theme.colors.text },
    expenseMeta: {
      fontFamily: 'Inter-Regular',
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    expenseRight: { alignItems: 'flex-end' },
    expenseTotal: { fontFamily: 'Inter-Bold', fontSize: 15, color: theme.colors.text },
    expenseShare: { fontFamily: 'Inter-Regular', fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
    settleBtn: {
      position: 'absolute',
      left: 24,
      right: 24,
      backgroundColor: theme.colors.primary,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
    },
    settleBtnText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 16 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
    inviteSheet: {
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
    inviteTitle: {
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
    createBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    createBtnDisabled: { opacity: 0.5 },
    createBtnText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 16 },
  });
