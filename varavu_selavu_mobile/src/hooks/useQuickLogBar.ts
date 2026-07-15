import { useCallback, useContext, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { listGroups, getGroupDetail, addGroupExpense } from '../api/groups';
import { addExpense } from '../api/expenses';
import { parseQuickLog, QuickLogParsed } from '../utils/quickLogParse';
import { notifyExpenseChanged } from '../utils/expenseEvents';
import { showToast } from '../components/Toast';
import { AddExpenseContext } from '../screens/AddExpenseScreen';

function todayMMDDYYYY(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Mobile-specific heuristic (not ported from web — web's bar treats any unparseable text as a
 * question with no third branch): distinguishes "an actual question" from "a log attempt that
 * just didn't parse", so the latter can fall back to the full Add Expense sheet instead of
 * routing to the AI Analyst tab. */
function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.endsWith('?')) return true;
  return /^(what|how|when|where|why|who|which|is|are|can|could|should|do|does|did|will|would)\b/i.test(t);
}

/**
 * TrackSpense v3 "type to log" bar — orchestration hook shared by `TypeToLogBar.tsx`. Ported
 * from the web app's `useQuickLogBar.ts` + `useLogExpense.ts` combined (mobile has no separate
 * save hook — `AddExpenseScreen.tsx`'s two submit paths own that logic today, mirrored here).
 */
export function useQuickLogBar() {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { accessToken, userEmail } = useAuth();
  const navigation = useNavigation<any>();
  const qc = useQueryClient();
  const { openAddExpense } = useContext(AddExpenseContext);

  // Same query key AddExpenseScreen.tsx already uses for its group picker — shares cache.
  const { data: groupsData } = useQuery({
    queryKey: ['groups', false],
    queryFn: () => listGroups(false),
    enabled: !!accessToken,
  });

  const parsed: QuickLogParsed | null = parseQuickLog(text, groupsData ?? []);
  const isQuestion = !parsed && looksLikeQuestion(text);

  const submit = useCallback(async () => {
    if (!text.trim() || submitting) return;

    if (!parsed) {
      if (isQuestion) {
        const question = text;
        setText('');
        navigation.navigate('AI Analyst', { initialQuery: question });
      } else {
        setText('');
        openAddExpense();
      }
      return;
    }

    if (!accessToken || !userEmail) return;
    setSubmitting(true);
    try {
      if (!parsed.groupId) {
        await addExpense(
          {
            description: parsed.description,
            cost: parsed.amount,
            category: parsed.category,
            sub_category: parsed.category,
            date: todayMMDDYYYY(),
            user_id: userEmail,
            merchant_name: parsed.merchant ?? undefined,
          },
          accessToken
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast({ message: 'Expense saved', type: 'success' });
        notifyExpenseChanged();
      } else {
        const detail = await getGroupDetail(parsed.groupId);
        const myMember = detail.members.find((m) => m.user_email === userEmail);
        if (!myMember) {
          // Deliberately stricter than AddExpenseScreen's members[0] fallback — there's no
          // confirmation step here to catch a wrongly-attributed payer.
          throw new Error("You don't appear to be an active member of that group.");
        }
        await addGroupExpense(parsed.groupId, {
          date: todayMMDDYYYY(),
          description: parsed.description,
          category: parsed.category,
          amount: parsed.amount,
          merchant_name: parsed.merchant ?? undefined,
          payers: [{ member_id: myMember.member_id, amount_paid: parsed.amount }],
          split: { type: 'equal', entries: detail.members.map((m) => ({ member_id: m.member_id })) },
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast({ message: 'Group expense added', type: 'success' });
        notifyExpenseChanged();
        // GroupsScreen/PeopleList/GroupDetailScreen aren't subscribed to notifyExpenseChanged
        // and the app's QueryClient has refetchOnWindowFocus: false, so these need an explicit
        // invalidation or they'd show stale balances until a manual pull-to-refresh.
        qc.invalidateQueries({ queryKey: ['group-expenses', parsed.groupId] });
        qc.invalidateQueries({ queryKey: ['group-balances', parsed.groupId] });
        qc.invalidateQueries({ queryKey: ['groups'] });
        qc.invalidateQueries({ queryKey: ['friend-balances'] });
      }
      setText('');
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast({ message: error.message || 'Failed to save', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }, [text, parsed, isQuestion, submitting, accessToken, userEmail, navigation, openAddExpense, qc]);

  return { text, setText, parsed, isQuestion, submitting, submit };
}
