import React from 'react';
import { parseQuickLog, QuickLogParsed } from '../utils/quickLogParse';
import { listGroups, GroupSummary } from '../api/groups';
import { useGroupsEnabled } from './useGroupsEnabled';
import { useLogExpense } from './useLogExpense';
import { useAsk } from '../context/AskContext';

export interface QuickLogBarState {
  text: string;
  setText: (text: string) => void;
  parsed: QuickLogParsed | null;
  memberCount: number;
  /** True once there's text but `parseQuickLog` couldn't find an amount in it — submitting in
   * this state asks the AI instead of logging anything. Lets the UI hint "press Enter to ask". */
  isQuestion: boolean;
  submitting: boolean;
  error: string | null;
  submit: () => Promise<void>;
}

/**
 * Shared "type to log (or ask)" state — used by both the mobile Dashboard's `TypeToLogBar` and
 * the desktop header's equivalent bar, so the parsing/group-matching/save orchestration lives in
 * exactly one place. When `parseQuickLog` (a plain regex parser, no AI) finds an amount, this
 * behaves as before: preview-then-confirm, saves via the real create-expense APIs. When it can't
 * find one, the text is treated as a question and forwarded to the real AI Analyst chat
 * (`useAsk`) instead of silently doing nothing — the input's own "Log or ask anything…"
 * placeholder promises both, so a non-loggable string shouldn't be a dead end. Note this only
 * covers genuine questions: the AI itself now also has expense-creation tools (see
 * chat_service.py's create_expense/create_group_expense), but this input's *fast path* still
 * only fires those indirectly, via the chat turn — it doesn't try to detect "this is secretly a
 * log request with no digit in it" client-side.
 */
export function useQuickLogBar(): QuickLogBarState {
  const { enabled: groupsEnabled } = useGroupsEnabled();
  const { logPersonal, logToGroup } = useLogExpense();
  const { openAsk } = useAsk();
  const [text, setText] = React.useState('');
  const [groups, setGroups] = React.useState<GroupSummary[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!groupsEnabled) return;
    let mounted = true;
    (async () => {
      try {
        const g = await listGroups();
        if (mounted) setGroups(g);
      } catch {
        if (mounted) setGroups([]);
      }
    })();
    return () => { mounted = false; };
  }, [groupsEnabled]);

  const parsed = parseQuickLog(text, groups.map((g) => ({ group_id: g.group_id, name: g.name })));
  const matchedGroup = parsed?.groupId ? groups.find((g) => g.group_id === parsed.groupId) : undefined;
  const memberCount = matchedGroup?.member_count ?? 1;
  const isQuestion = !parsed && text.trim() !== '';

  const submit = async () => {
    if (submitting) return;
    if (!parsed) {
      if (text.trim()) {
        openAsk(text.trim());
        setText('');
      }
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (parsed.groupId) {
        await logToGroup(parsed.groupId, {
          description: parsed.description,
          category: parsed.category,
          amount: parsed.amount,
          merchantName: parsed.merchant || undefined,
        });
      } else {
        await logPersonal({
          description: parsed.description,
          category: parsed.category,
          amount: parsed.amount,
          merchantName: parsed.merchant || undefined,
        });
      }
      setText('');
    } catch {
      setError('Failed to log expense. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return { text, setText, parsed, memberCount, isQuestion, submitting, error, submit };
}
