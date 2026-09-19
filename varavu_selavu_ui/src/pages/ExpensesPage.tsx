import React from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import AddExpenseForm, { findMainCategory } from '../components/expenses/AddExpenseForm';
import GroupScopeFilter from '../components/common/GroupScopeFilter';
import ExpenseFeed, { FeedExpense, formatMoney } from '../components/expenses/ExpenseFeed';
import ExpenseDetailSheet, { ExpenseDetailForm } from '../components/expenses/ExpenseDetailSheet';
import MoveToGroupDialog from '../components/expenses/MoveToGroupDialog';
import RecurringTab from '../components/expenses/RecurringTab';
import SegmentedTabs from '../components/common/SegmentedTabs';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { listExpenses, deleteExpense, updateExpense, exportMyExpensesCsv, ExpenseRecord } from '../api/expenses';
import {
  listAllMyGroupExpenses,
  updateGroupExpense,
  deleteGroupExpense,
  UnifiedGroupExpenseRow,
} from '../api/groups';
import { AnalysisScope } from '../api/analysis';
import { applyTagsToExpense, removeTagFromExpense } from '../api/tags';
import TagFilterSelect from '../components/tags/TagFilterSelect';
import BulkTagDialog from '../components/tags/BulkTagDialog';
import EmptyState from '../components/common/EmptyState';
import { useGroupsEnabled } from '../hooks/useGroupsEnabled';
import { useTagsEnabled } from '../hooks/useTagsEnabled';
import { useQuickCapture } from '../context/QuickCaptureContext';
import { isoToMMDDYYYY, parseAppDate } from '../utils/date';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';

type ExpensesTab = 'transactions' | 'recurring';

/**
 * ExpensesPage (TS-DES-102 rebuild, TS-DES-204 sub-tab host) — all three scopes (personal/
 * groups/combined) render through the single day-grouped `ExpenseFeed` component. TS-DES-204
 * adds a `Transactions`/`Recurring` `SubTabBar` (reusing the shared `SegmentedTabs` control);
 * `Recurring` folds in the former standalone `/recurring` page (`RecurringTab`, migrated
 * unchanged) as its second tab.
 */
const ExpensesPage: React.FC = () => {
  const user = localStorage.getItem('vs_user') || '';
  const queryClient = useQueryClient();
  const { enabled: groupsEnabled } = useGroupsEnabled();
  const { enabled: tagsEnabled } = useTagsEnabled();
  const { openQuickCapture } = useQuickCapture();
  const [scope, setScope] = React.useState<AnalysisScope>('combined');
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: ExpensesTab = tabParam === 'recurring' ? 'recurring' : 'transactions';
  const handleTabChange = (next: ExpensesTab) => {
    setSearchParams(next === 'transactions' ? {} : { tab: next }, { replace: true });
  };

  // TS-TAG-111 — declared here (not down by feedExpenses) since the personal queries below need
  // it server-side: GET /expenses supports tag_ids natively (PRD §10.4), and filtering there
  // (rather than only client-side after the fact) keeps results correct across pagination —
  // client-side-only filtering would silently miss tagged expenses on pages not yet fetched.
  const [tagFilterIds, setTagFilterIds] = React.useState<string[]>([]);
  // Design review (2026-09): neither control existed on this page before — search/date
  // navigation weren't just mis-ordered behind the tag filter, they were entirely absent.
  // Both filter client-side over the already-merged `feedExpenses` below (same scope as the
  // existing tag filter's group-row pass), not a new backend query.
  const [searchQuery, setSearchQuery] = React.useState('');
  const [monthFilter, setMonthFilter] = React.useState(''); // 'YYYY-MM', '' = all time

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['expenses', user, tagFilterIds],
    queryFn: ({ pageParam = 0 }) => listExpenses(pageParam, 30, tagFilterIds),
    getNextPageParam: (lastPage) => lastPage.next_offset ?? undefined,
    enabled: !!user,
    initialPageParam: 0,
  });
  const personalExpenses: ExpenseRecord[] = React.useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data]
  );

  // Groups/Combined scope: a separate, unpaginated fetch (Phase-1 group volumes
  // are expected to be small, spec §6.5) so these two scopes always show the
  // full merged set rather than being limited to whatever personal pages the
  // infinite-query above happens to have loaded so far.
  const groupExpensesQuery = useQuery({
    queryKey: ['all-group-expenses'],
    queryFn: listAllMyGroupExpenses,
    enabled: groupsEnabled && scope !== 'personal',
  });
  const combinedPersonalQuery = useQuery({
    queryKey: ['expenses-full-for-combined', user, tagFilterIds],
    queryFn: () => listExpenses(0, 500, tagFilterIds),
    enabled: !!user && scope === 'combined',
  });

  const feedLoading =
    (scope === 'personal' && !data) ||
    (scope === 'groups' && groupExpensesQuery.isLoading) ||
    (scope === 'combined' && (groupExpensesQuery.isLoading || combinedPersonalQuery.isLoading));

  const scopedRows: FeedExpense[] = React.useMemo(() => {
    const groupRows: FeedExpense[] = (groupExpensesQuery.data || []).map((e: UnifiedGroupExpenseRow) => ({
      key: `group-${e.row_id}`,
      kind: 'group',
      id: e.row_id,
      groupId: e.group_id,
      date: e.date,
      description: e.description,
      merchantName: e.merchant_name || undefined,
      category: e.category,
      mainCategory: findMainCategory(e.category),
      amount: e.my_share,
      groupAmount: e.cost,
      groupName: e.group_name,
      payerSummary: e.payer_summary,
      splitType: e.split_type,
      tags: e.tags,
      card: e.card,
      notes: e.notes || undefined,
    }));

    let result: FeedExpense[];
    if (scope === 'groups') {
      result = groupRows;
    } else if (scope === 'personal') {
      result = personalExpenses.map((e) => ({
        key: `personal-${e.row_id}`,
        kind: 'personal',
        id: e.row_id,
        date: e.date,
        description: e.description,
        merchantName: e.merchant_name || undefined,
        category: e.category,
        mainCategory: findMainCategory(e.category),
        amount: e.cost,
        itemCount: e.item_count,
        splitType: e.split_type,
        tags: e.tags,
        card: e.card,
        notes: e.notes || undefined,
      }));
    } else {
      // combined
      const personalRows: FeedExpense[] = (combinedPersonalQuery.data?.items || []).map((e) => ({
        key: `personal-${e.row_id}`,
        kind: 'personal',
        id: e.row_id,
        date: e.date,
        description: e.description,
        merchantName: e.merchant_name || undefined,
        category: e.category,
        mainCategory: findMainCategory(e.category),
        amount: e.cost,
        itemCount: e.item_count,
        splitType: e.split_type,
        tags: e.tags,
        card: e.card,
        notes: e.notes || undefined,
      }));
      result = [...personalRows, ...groupRows];
    }
    return result;
  }, [scope, groupExpensesQuery.data, personalExpenses, combinedPersonalQuery.data]);

  // Months that actually have expenses in the current scope, newest first — drives the month
  // selector so it never offers an empty month. A native `<input type="month">` used to sit
  // here; it rendered as a bare text field on desktop Safari and mis-aligned/vanished on
  // phones, so this is a plain select instead.
  const availableMonths = React.useMemo(() => {
    const keys = new Set<string>();
    for (const r of scopedRows) {
      const d = parseAppDate(r.date);
      keys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return Array.from(keys)
      .sort()
      .reverse()
      .map((key) => {
        const [y, m] = key.split('-').map(Number);
        return { key, label: new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
      });
  }, [scopedRows]);

  const feedExpenses: FeedExpense[] = React.useMemo(() => {
    let result = scopedRows;

    // TS-TAG-111 — the primary retrieval surface (PRD §5.2). Personal rows are already
    // server-filtered above (GET /expenses supports tag_ids, PRD §10.4) — this second pass is a
    // no-op for them but is what actually filters group rows, which come from a client-composed
    // unified list with no backend tag_ids support of its own (§10.4 only covers GET /expenses
    // and GET /analysis).
    if (tagFilterIds.length > 0) {
      const wanted = new Set(tagFilterIds);
      result = result.filter((r) => (r.tags || []).some((t) => wanted.has(t.id)));
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((r) =>
        r.description.toLowerCase().includes(q) ||
        (r.merchantName || '').toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
      );
    }

    if (monthFilter) {
      result = result.filter((r) => {
        const d = parseAppDate(r.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return key === monthFilter;
      });
    }

    return result;
  }, [scopedRows, tagFilterIds, searchQuery, monthFilter]);

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ExpenseRecord | null>(null);
  const [deletingKey, setDeletingKey] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<{ open: boolean; message: string; severity: 'success' | 'error' }>(
    { open: false, message: '', severity: 'success' }
  );
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<ExpenseRecord | null>(null);
  const [exporting, setExporting] = React.useState(false);

  // TS-TAG-108 — bulk tagging select mode. Selection is keyed by FeedExpense.key so it survives
  // scope switches cleanly (a stale key just selects nothing rather than the wrong row).
  const [selectMode, setSelectMode] = React.useState(false);
  const [selectedKeys, setSelectedKeys] = React.useState<Set<string>>(new Set());
  const [bulkDialogMode, setBulkDialogMode] = React.useState<'apply' | 'remove' | null>(null);

  const selectedExpenses = React.useMemo(
    () => feedExpenses.filter((e) => selectedKeys.has(e.key)),
    [feedExpenses, selectedKeys]
  );
  const selectedTotal = selectedExpenses.reduce((sum, e) => sum + e.amount, 0);
  const selectedCurrencies = new Set(selectedExpenses.map((e) => e.currency || 'USD'));
  const selectedCurrency = selectedCurrencies.size === 1 ? selectedExpenses[0]?.currency : undefined;

  const toggleSelect = (expense: FeedExpense) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(expense.key)) next.delete(expense.key);
      else next.add(expense.key);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedKeys(new Set());
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportMyExpensesCsv();
    } catch {
      setToast({ open: true, message: 'Could not export your expenses.', severity: 'error' });
    } finally {
      setExporting(false);
    }
  };

  // --- Detail sheet state (tap-to-open, inline edit — TS-DES-102) ---
  const [detailExpense, setDetailExpense] = React.useState<FeedExpense | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detailSaving, setDetailSaving] = React.useState(false);
  const [detailDeleting, setDetailDeleting] = React.useState(false);
  const [moveExpense, setMoveExpense] = React.useState<FeedExpense | null>(null);

  const invalidateForScope = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses', user] });
    queryClient.invalidateQueries({ queryKey: ['expenses-full-for-combined', user] });
    queryClient.invalidateQueries({ queryKey: ['all-group-expenses'] });
    // An edit's tag_names can create brand-new tags server-side — without this the Filter by
    // tag list kept showing the pre-save set until a full reload.
    queryClient.invalidateQueries({ queryKey: ['tags'] });
  };

  const handleDeletePersonal = async (row_id: number) => {
    try {
      setDeletingKey(`personal-${row_id}`);
      await deleteExpense(row_id);
      invalidateForScope();
      setToast({ open: true, message: 'Expense deleted', severity: 'success' });
    } catch (e) {
      setToast({ open: true, message: 'Failed to delete expense', severity: 'error' });
    } finally {
      setDeletingKey(null);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setEditing(null);
  };

  const handleSuccess = () => {
    invalidateForScope();
    handleClose();
  };

  // --- Row-level actions wired from ExpenseFeed (hover-reveal edit/delete + tap-to-open) ---
  const handleRowSelect = (expense: FeedExpense) => {
    setDetailExpense(expense);
    setDetailOpen(true);
  };

  const handleRowEdit = (expense: FeedExpense) => {
    if (expense.kind === 'personal') {
      const record = personalExpenses.find((e) => e.row_id === expense.id) || combinedPersonalQuery.data?.items.find((e) => e.row_id === expense.id);
      if (record) {
        setEditing(record);
        setOpen(true);
        return;
      }
    }
    // Group rows (and any personal row we couldn't resolve back to a full
    // record) fall back to the detail sheet's inline editor.
    handleRowSelect(expense);
  };

  const handleRowDeleteRequest = (expense: FeedExpense) => {
    if (expense.kind === 'personal') {
      const record = personalExpenses.find((e) => e.row_id === expense.id) || combinedPersonalQuery.data?.items.find((e) => e.row_id === expense.id);
      setPendingDelete(
        record || {
          row_id: expense.id as number,
          user_id: user,
          date: expense.date,
          description: expense.description,
          category: expense.category,
          cost: expense.amount,
          merchant_name: expense.merchantName,
        }
      );
      setConfirmOpen(true);
      return;
    }
    // Group rows: delete directly (no separate confirm dialog exists for
    // group expenses in this codebase yet — matching the immediate-delete
    // behavior the old <Box>-row list had, since it never wired a delete
    // affordance for group rows at all).
    handleGroupDelete(expense);
  };

  const handleGroupDelete = async (expense: FeedExpense) => {
    if (!expense.groupId) return;
    try {
      setDeletingKey(expense.key);
      await deleteGroupExpense(expense.groupId, String(expense.id));
      invalidateForScope();
      setToast({ open: true, message: 'Expense deleted', severity: 'success' });
      if (detailExpense?.key === expense.key) setDetailOpen(false);
    } catch (e) {
      setToast({ open: true, message: 'Failed to delete expense', severity: 'error' });
    } finally {
      setDeletingKey(null);
    }
  };

  const handleDetailSave = async (expense: FeedExpense, patch: ExpenseDetailForm) => {
    setDetailSaving(true);
    try {
      const amount = parseFloat(patch.amount) || 0;
      // The detail sheet edits description and merchant as separate fields, so a personal
      // expense's distinct description ("Coffee run") isn't clobbered just because its merchant
      // field was edited ("Starbucks"), and a blank merchant stays blank rather than inheriting
      // the description. A description cleared to empty falls back to the stored one, since the
      // API requires it. `patch.date` comes back
      // as ISO 'YYYY-MM-DD' (the native date input's shape) and needs converting to the
      // MM/DD/YYYY both update endpoints expect.
      const date = isoToMMDDYYYY(patch.date);
      // Explicit null (not undefined) so clearing the field actually clears the stored note —
      // an omitted `notes` means "leave unchanged" server-side.
      const notes = patch.notes.trim() || null;
      if (expense.kind === 'personal') {
        await updateExpense(expense.id as number, {
          user_id: user,
          date,
          description: patch.description.trim() || expense.description,
          category: patch.category,
          cost: amount,
          merchant_name: patch.merchantName || undefined,
          // Explicit array always sent — this sheet always shows the expense's current tags,
          // so full-replace semantics (PRD §10.2) are correct whether or not they changed.
          tag_names: patch.tagNames,
          // TS-CARD-114 — always-replace, same reasoning as tag_names above.
          card_id: patch.cardId,
          notes,
        });
      } else if (expense.groupId) {
        // Phase-1 group expenses are always equal-split (AddExpenseForm never
        // offers exact/percentage yet), and the group-expense list endpoint
        // doesn't return the original split entries — only payer_summary. So
        // an edit here preserves the existing payer(s) (threaded through as
        // `payerSummary` on the FeedExpense) and re-submits an equal split
        // across them, which reproduces current behavior for every group
        // expense that exists today. A true "edit split" flow is out of
        // scope for this ticket (no split editor is part of this detail
        // sheet) and should be a follow-up if group expenses ever gain
        // non-equal splits before this component gets revisited.
        const payers = expense.payerSummary?.length
          ? expense.payerSummary.map((p) => ({ member_id: p.member_id, amount_paid: amount }))
          : [];
        await updateGroupExpense(expense.groupId, String(expense.id), {
          date,
          description: patch.description.trim() || expense.description,
          category: patch.category,
          amount,
          merchant_name: patch.merchantName || undefined,
          payers,
          split: { type: 'equal', entries: payers.map((p) => ({ member_id: p.member_id })) },
          // TS-CARD-114 — unlike tags, the group create/update endpoint carries card_id
          // directly (no separate association model needed for a single nullable value),
          // so this is always-replace with no diff-and-sync step required.
          card_id: patch.cardId,
          notes,
        });
        if (patch.tagNames) {
          // Group expenses have no tag_names write-through field (TS-TAG-104 is personal-only
          // by design) — sync via the association endpoints instead, applying/removing just
          // what actually changed.
          const before = new Set((expense.tags || []).map((t) => t.name.toLowerCase()));
          const after = new Set(patch.tagNames.map((n) => n.toLowerCase()));
          const toAdd = patch.tagNames.filter((n) => !before.has(n.toLowerCase()));
          const toRemove = (expense.tags || []).filter((t) => !after.has(t.name.toLowerCase()));
          if (toAdd.length > 0) {
            await applyTagsToExpense(String(expense.id), { tag_names: toAdd });
          }
          await Promise.all(toRemove.map((t) => removeTagFromExpense(String(expense.id), t.id)));
        }
      }
      invalidateForScope();
      setToast({ open: true, message: 'Expense updated', severity: 'success' });
      setDetailOpen(false);
    } catch (e) {
      setToast({ open: true, message: 'Failed to update expense', severity: 'error' });
    } finally {
      setDetailSaving(false);
    }
  };

  const handleDetailDelete = async (expense: FeedExpense) => {
    if (expense.kind === 'personal') {
      setDetailDeleting(true);
      try {
        await deleteExpense(expense.id as number);
        invalidateForScope();
        setToast({ open: true, message: 'Expense deleted', severity: 'success' });
        setDetailOpen(false);
      } catch (e) {
        setToast({ open: true, message: 'Failed to delete expense', severity: 'error' });
      } finally {
        setDetailDeleting(false);
      }
      return;
    }
    setDetailDeleting(true);
    await handleGroupDelete(expense);
    setDetailDeleting(false);
  };

  return (
    <Box sx={{ mt: 4, px: { xs: 1, sm: 2 } }}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Expenses
          </Typography>
          {tab === 'transactions' && groupsEnabled && <GroupScopeFilter value={scope} onChange={setScope} />}
        </Box>

        {/* Design review (2026-09): "put search and date navigation ahead of less frequently
            used controls" — this row is new (neither existed before) and comes first, ahead of
            the tag filter / Select / Export cluster below. */}
        {/* Stacked below `md`: as one wrapping row, the button group landed on top of the
            month select at phone widths. */}
        {tab === 'transactions' && (
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'center' }, mb: 2, gap: 1 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
              <TextField
                size="small"
                placeholder="Search expenses"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{ minWidth: 200, flex: { xs: '1 1 100%', sm: '0 1 auto' } }}
              />
              <TextField
                select
                size="small"
                label="Month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                sx={{ minWidth: 170, flex: { xs: '1 1 auto', sm: '0 1 auto' } }}
              >
                <MenuItem value="">All time</MenuItem>
                {availableMonths.map((m) => (
                  <MenuItem key={m.key} value={m.key}>{m.label}</MenuItem>
                ))}
              </TextField>
              {tagsEnabled && <TagFilterSelect value={tagFilterIds} onChange={setTagFilterIds} />}
            </Box>

            {/* TrackSpense v3 Prototype — this now opens the shared Quick Capture sheet/dialog
                instead of AddExpenseForm; the Dialog+AddExpenseForm below is still used, but only
                reached via a row's Edit icon (handleRowEdit) now. */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', flexShrink: 0, justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
              {/* TS-TAG-108 — bulk tagging entry point; only meaningful when tags exist to apply. */}
              {tagsEnabled && (
                <Button
                  variant={selectMode ? 'contained' : 'outlined'}
                  onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                >
                  {selectMode ? 'Cancel' : 'Select'}
                </Button>
              )}
              <Button
                variant="outlined"
                startIcon={<FileDownloadOutlinedIcon />}
                disabled={exporting}
                onClick={handleExport}
              >
                {exporting ? 'Exporting…' : 'Export CSV'}
              </Button>
              <Button variant="contained" onClick={() => openQuickCapture()}>
                Add Expense
              </Button>
            </Box>
          </Box>
        )}

        {/* TS-TAG-108 — sticky bulk action bar, shown only in select mode so it doesn't compete
            with the page's normal chrome the rest of the time. */}
        {tab === 'transactions' && selectMode && (
          <Box
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
              flexWrap: 'wrap',
              p: 1.5,
              mb: 2,
              borderRadius: 1,
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: 2,
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {selectedKeys.size} selected
              {selectedKeys.size > 0 ? ` · ${formatMoney(selectedTotal, selectedCurrency)}` : ''}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" variant="outlined" disabled={selectedKeys.size === 0} onClick={() => setBulkDialogMode('apply')}>
                Tag
              </Button>
              <Button size="small" variant="outlined" disabled={selectedKeys.size === 0} onClick={() => setBulkDialogMode('remove')}>
                Untag
              </Button>
              <Button size="small" onClick={exitSelectMode}>Clear</Button>
            </Box>
          </Box>
        )}

        {/* TS-DES-204 — Transactions/Recurring sub-tab host; Recurring folds in the former
            standalone /recurring page. */}
        <Box sx={{ maxWidth: 320, mb: 2.5 }}>
          <SegmentedTabs<ExpensesTab>
            value={tab}
            onChange={handleTabChange}
            options={[
              { value: 'transactions', label: 'Transactions' },
              { value: 'recurring', label: 'Recurring' },
            ]}
            fullWidth
            ariaLabel="Expenses section"
          />
        </Box>

        {tab === 'transactions' ? (
          <ExpenseFeed
            expenses={feedExpenses}
            loading={feedLoading}
            // UI-08: a filter that matched nothing and a genuinely empty ledger are different
            // situations and get different copy + actions.
            emptyState={
              searchQuery.trim() || monthFilter || tagFilterIds.length > 0 ? (
                <EmptyState
                  title="No expenses match this view"
                  description="Try a different search, month, or tag — or clear the filters to see everything."
                  actionLabel="Clear filters"
                  onAction={() => {
                    setSearchQuery('');
                    setMonthFilter('');
                    setTagFilterIds([]);
                  }}
                />
              ) : (
                <EmptyState
                  title="No expenses yet"
                  description="Add your first purchase to start tracking this month — type a line like “coffee 6.75 at Blue Bottle” or scan a receipt."
                  actionLabel="Add your first expense"
                  onAction={() => openQuickCapture()}
                />
              )
            }
            onSelect={handleRowSelect}
            onEdit={handleRowEdit}
            onDelete={handleRowDeleteRequest}
            deletingKey={deletingKey}
            onLoadMore={scope === 'personal' ? () => fetchNextPage() : undefined}
            hasMore={scope === 'personal' ? !!hasNextPage : false}
            loadingMore={isFetchingNextPage}
            selectable={selectMode}
            selectedKeys={selectedKeys}
            onToggleSelect={toggleSelect}
          />
        ) : (
          <RecurringTab />
        )}
      </motion.div>

      <ExpenseDetailSheet
        expense={detailExpense}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onSave={handleDetailSave}
        onDelete={handleDetailDelete}
        onMoveToGroup={
          groupsEnabled
            ? (expense) => {
                setDetailOpen(false);
                setMoveExpense(expense);
              }
            : undefined
        }
        saving={detailSaving}
        deleting={detailDeleting}
      />

      <BulkTagDialog
        open={bulkDialogMode !== null}
        mode={bulkDialogMode || 'apply'}
        expenseIds={selectedExpenses.map((e) => String(e.id))}
        onClose={() => setBulkDialogMode(null)}
        onDone={(message) => {
          setBulkDialogMode(null);
          exitSelectMode();
          invalidateForScope();
          setToast({ open: true, message, severity: 'success' });
        }}
      />

      <MoveToGroupDialog
        open={!!moveExpense}
        expenseId={moveExpense ? (moveExpense.id as number) : null}
        amount={moveExpense ? Math.abs(moveExpense.amount) : 0}
        onClose={() => setMoveExpense(null)}
        onSuccess={() => {
          invalidateForScope();
          setMoveExpense(null);
          setToast({ open: true, message: 'Expense moved to group', severity: 'success' });
        }}
      />

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <Box sx={{ p: 2 }}>
          <AddExpenseForm
            existing={editing}
            onSuccess={() => {
              // Differentiate add vs edit using current editing value
              const wasEdit = !!editing;
              handleSuccess();
              setToast({ open: true, message: wasEdit ? 'Expense updated' : 'Expense added', severity: 'success' });
            }}
            onError={(msg) => setToast({ open: true, message: msg, severity: 'error' })}
            onCancel={handleClose}
            onMoveToGroup={
              groupsEnabled
                ? (record) => {
                    handleClose();
                    setMoveExpense({
                      key: `personal-${record.row_id}`,
                      kind: 'personal',
                      id: record.row_id,
                      date: record.date,
                      description: record.description,
                      merchantName: record.merchant_name || undefined,
                      category: record.category,
                      mainCategory: findMainCategory(record.category),
                      amount: record.cost,
                      itemCount: record.item_count,
                      splitType: record.split_type,
                    });
                  }
                : undefined
            }
          />
        </Box>
      </Dialog>
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <Box sx={{ p: 3, minWidth: 320 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Delete expense?</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This action cannot be undone.
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button color="error" variant="contained"
              onClick={() => {
                const id = pendingDelete?.row_id;
                setConfirmOpen(false);
                if (id) handleDeletePersonal(id);
              }}
            >
              Delete
            </Button>
          </Box>
        </Box>
      </Dialog>
      <Snackbar
        open={toast.open}
        autoHideDuration={2500}
        onClose={() => setToast(t => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setToast(t => ({ ...t, open: false }))} severity={toast.severity} variant="filled" sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ExpensesPage;
