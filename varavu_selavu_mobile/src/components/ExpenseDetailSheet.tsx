/**
 * ExpenseDetailSheet.tsx — TS-GRP-126/127/129: comments, edit history, and
 * "settle my share" for a single group expense. Mirrors the web
 * ExpenseDetailDialog's scope in a bottom-sheet form.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import CustomButton from './CustomButton';
import { showToast } from './Toast';
import {
  ApiError,
  ExpenseCommentDTO,
  ExpenseHistoryEntry,
  GroupExpenseRow,
  MemberDTO,
  addExpenseComment,
  deleteExpenseComment,
  deleteGroupExpense,
  getExpenseHistory,
  listExpenseComments,
  settleExpenseShare,
} from '../api/groups';

interface Props {
  visible: boolean;
  onClose: () => void;
  groupId: string;
  expense: GroupExpenseRow | null;
  members: MemberDTO[];
  myMemberId?: string;
  onSettled?: () => void;
  onDeleted?: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  description: 'Description',
  category: 'Category',
  amount: 'Amount',
  merchant_name: 'Merchant',
};

function formatFieldValue(field: string, value: any): string {
  if (value === null || value === undefined) return '—';
  if (field === 'amount') return `$${Number(value).toFixed(2)}`;
  return String(value);
}

export default function ExpenseDetailSheet({ visible, onClose, groupId, expense, members, myMemberId, onSettled, onDeleted }: Props) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();

  const [comments, setComments] = useState<ExpenseCommentDTO[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);

  const [history, setHistory] = useState<ExpenseHistoryEntry[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [settling, setSettling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!visible || !expense) return;
    setCommentsLoading(true);
    listExpenseComments(groupId, expense.row_id)
      .then(setComments)
      .catch(() => {})
      .finally(() => setCommentsLoading(false));
    setHistoryLoading(true);
    getExpenseHistory(groupId, expense.row_id)
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [visible, groupId, expense?.row_id]);

  if (!expense) return null;

  const handlePostComment = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      const c = await addExpenseComment(groupId, expense.row_id, newComment.trim());
      setComments((prev) => [...prev, c]);
      setNewComment('');
    } catch (e) {
      showToast({ message: e instanceof ApiError ? e.message : 'Failed to add comment', type: 'error' });
    } finally {
      setPosting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteExpenseComment(groupId, expense.row_id, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (e) {
      showToast({ message: e instanceof ApiError ? e.message : 'Failed to delete comment', type: 'error' });
    }
  };

  const handleSettleMyShare = async () => {
    if (!myMemberId) return;
    const payload: { member_id: string; payer_member_id?: string } = { member_id: myMemberId };
    if (expense.payer_summary.length > 1) {
      const biggest = [...expense.payer_summary].sort((a, b) => b.amount_paid - a.amount_paid)[0];
      payload.payer_member_id = biggest.member_id;
    }
    setSettling(true);
    try {
      await settleExpenseShare(groupId, expense.row_id, payload);
      showToast({ message: 'Share settled', type: 'success' });
      onSettled?.();
    } catch (e) {
      showToast({ message: e instanceof ApiError ? e.message : 'Failed to settle share', type: 'error' });
    } finally {
      setSettling(false);
    }
  };

  const handleDeleteExpense = async () => {
    setDeleting(true);
    try {
      await deleteGroupExpense(groupId, expense.row_id);
      showToast({ message: 'Expense deleted', type: 'success' });
      onDeleted?.();
    } catch (e) {
      showToast({ message: e instanceof ApiError ? e.message : 'Failed to delete expense', type: 'error' });
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const canSettle = !!myMemberId && expense.my_share > 0 && !expense.payer_summary.some((p) => p.member_id === myMemberId);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.background, paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={styles.pill} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
              {expense.description}
            </Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.summaryRow}>
            <View>
              <Text style={[styles.metaText, { color: theme.colors.textSecondary }]}>
                {expense.category} · {expense.date}
              </Text>
              <Text style={[styles.amountText, { color: theme.colors.text }]}>
                ${expense.cost.toFixed(2)} {expense.currency && expense.currency !== 'USD' ? expense.currency : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.metaText, { color: theme.colors.textSecondary }]}>My expense</Text>
              <Text style={[styles.amountText, { color: theme.colors.text }]}>${expense.my_share.toFixed(2)}</Text>
            </View>
          </View>

          {canSettle && (
            <CustomButton
              title={settling ? 'Settling...' : `Settle my $${expense.my_share.toFixed(2)} share`}
              onPress={handleSettleMyShare}
              disabled={settling}
              variant="tinted"
              style={{ marginBottom: 16 }}
            />
          )}

          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Comments</Text>
          {commentsLoading ? (
            <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 12 }} />
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(c) => c.id}
              style={{ maxHeight: 160 }}
              ListEmptyComponent={
                <Text style={[styles.metaText, { color: theme.colors.textSecondary, marginBottom: 8 }]}>No comments yet.</Text>
              }
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontFamily: 'Inter-Regular', fontSize: 14 }}>
                      <Text style={{ fontFamily: 'Inter-SemiBold' }}>{item.author_display_name}</Text> {item.body}
                    </Text>
                    <Text style={[styles.metaText, { color: theme.colors.textSecondary }]}>
                      {new Date(item.created_at).toLocaleString()}
                    </Text>
                  </View>
                  <Pressable onPress={() => handleDeleteComment(item.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={16} color={theme.colors.textSecondary} />
                  </Pressable>
                </View>
              )}
            />
          )}
          <View style={styles.commentInputRow}>
            <TextInput
              style={[styles.commentInput, { color: theme.colors.text, backgroundColor: theme.colors.surfaceSecondary }]}
              placeholder="Add a comment..."
              placeholderTextColor={theme.colors.textTertiary}
              value={newComment}
              onChangeText={setNewComment}
              onSubmitEditing={handlePostComment}
            />
            <Pressable onPress={handlePostComment} disabled={posting || !newComment.trim()} hitSlop={8}>
              <Ionicons name="send" size={20} color={theme.colors.primary} />
            </Pressable>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

          <Pressable style={styles.historyToggle} onPress={() => setHistoryVisible((v) => !v)}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>History ({history.length})</Text>
            <Ionicons name={historyVisible ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textSecondary} />
          </Pressable>
          {historyVisible && (
            historyLoading ? (
              <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 12 }} />
            ) : (
              <View style={{ marginTop: 8 }}>
                {history.map((h, idx) => (
                  <View key={idx} style={{ marginBottom: 12 }}>
                    <Text style={{ color: theme.colors.text, fontFamily: 'Inter-SemiBold', fontSize: 13 }}>
                      {h.actor_display_name}{' '}
                      {h.action === 'expense_created' ? 'created this expense' : h.action === 'expense_deleted' ? 'deleted this expense' : 'edited this expense'}
                    </Text>
                    {Object.entries(h.changed_fields || {}).map(([field, change]: [string, any]) => (
                      <Text key={field} style={[styles.metaText, { color: theme.colors.textSecondary }]}>
                        {change && typeof change === 'object' && 'from' in change
                          ? `${FIELD_LABELS[field] || field}: ${formatFieldValue(field, change.from)} → ${formatFieldValue(field, change.to)}`
                          : `${FIELD_LABELS[field] || field}: ${formatFieldValue(field, change)}`}
                      </Text>
                    ))}
                    <Text style={[styles.metaText, { color: theme.colors.textSecondary }]}>
                      {new Date(h.created_at).toLocaleString()}
                    </Text>
                  </View>
                ))}
              </View>
            )
          )}

          {!confirmDelete ? (
            <CustomButton
              title="Delete Expense"
              onPress={() => setConfirmDelete(true)}
              variant="danger"
              style={{ marginTop: 24 }}
              disabled={deleting || settling}
            />
          ) : (
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
              <CustomButton
                title={deleting ? "Deleting..." : "Confirm Delete"}
                onPress={handleDeleteExpense}
                variant="danger"
                style={{ flex: 1 }}
                disabled={deleting}
              />
              <CustomButton
                title="Cancel"
                onPress={() => setConfirmDelete(false)}
                variant="outline"
                style={{ flex: 1 }}
                disabled={deleting}
              />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  keyboardView: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    maxHeight: '85%',
  },
  pill: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#ccc', alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontFamily: 'Inter-Bold', fontSize: 18, flex: 1, marginRight: 12 },
  closeBtn: { padding: 4 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  metaText: { fontFamily: 'Inter-Regular', fontSize: 12, marginTop: 2 },
  amountText: { fontFamily: 'Inter-Bold', fontSize: 18 },
  divider: { height: 1, marginVertical: 16 },
  sectionTitle: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 8 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  commentInput: { flex: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontFamily: 'Inter-Regular', fontSize: 14 },
  historyToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
