import React, { useEffect, useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Avatar,
  Chip,
  CircularProgress,
  Toolbar,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import HandshakeRoundedIcon from '@mui/icons-material/HandshakeRounded';
import CloseIcon from '@mui/icons-material/CloseRounded';
import {
  ApiError,
  ExpenseCommentDTO,
  ExpenseHistoryEntry,
  GroupExpenseRow,
  MemberDTO,
  PayerSummaryItem,
  addExpenseComment,
  deleteExpenseComment,
  deleteGroupExpense,
  getExpenseHistory,
  getGroupExpenseItems,
  listExpenseComments,
  settleExpenseShare,
  updateGroupExpense,
  updateGroupExpenseItems,
} from '../../api/groups';
import { isoToMMDDYYYY, mmddyyyyToISO } from '../../utils/date';
import PaidBySplitSummary from './PaidBySplitSummary';
import { SplitEditorValue, computeSplitValid } from './SplitEditor';
import { computePayersValid } from './PayerPicker';
import { colorFromMemberId, initialsFromName } from './MemberAvatarStack';
import ScannedItemsCard, { ScannedItem } from '../expenses/ScannedItemsCard';
import CategoryPickerField from '../expenses/CategoryPickerField';
import { findMainCategory } from '../expenses/AddExpenseForm';
import { formatMoney } from '../expenses/ExpenseFeed';
import { typeScale, tabularNums } from '../../theme';

interface Props {
  open: boolean;
  onClose: () => void;
  groupId: string;
  expense: GroupExpenseRow;
  members: MemberDTO[];
  myMemberId?: string;
  groupCurrency?: string;
  /** 'edit' opens straight into the edit form (the row's edit icon) instead of the view. */
  initialMode?: 'view' | 'edit';
  /** Archived-group lockdown: hides the edit entry point, delete button,
   * settle-my-share action, and comment mutation controls — history stays
   * fully viewable, nothing here can change the archived group's data. */
  readOnly?: boolean;
  onSettled?: () => void;
  onDeleted?: () => void;
  onUpdated?: () => void;
  setToast: (toast: { open: boolean; message: string; severity: 'success' | 'error' | 'info' }) => void;
}

const fieldLabels: Record<string, string> = {
  description: 'Description',
  category: 'Category',
  amount: 'Amount',
  merchant_name: 'Merchant',
};

function formatFieldValue(field: string, value: any, currency: string = 'USD'): string {
  if (value === null || value === undefined) return '—';
  if (field === 'amount') return formatMoney(Number(value), currency);
  return String(value);
}

// Lightly-bordered section card — matches ScannedItemsCard's borderRadius:1.5 hairline-border
// treatment, so Items/Split/Comments/History all read as the same "cards inside a panel" layout.
const sectionCardSx = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1.5,
  p: 1.5,
} as const;

const ExpenseDetailDialog: React.FC<Props> = ({
  open,
  onClose,
  groupId,
  expense,
  members,
  myMemberId,
  groupCurrency,
  initialMode = 'view',
  readOnly,
  onSettled,
  onDeleted,
  onUpdated,
  setToast,
}) => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));

  // This expense's own currency wins (TS-GRP-131 per-expense currency override), falling
  // back to the group's currency, then USD — same precedence as the edit-save payload below.
  const displayCurrency = expense.currency || groupCurrency || 'USD';

  const [comments, setComments] = useState<ExpenseCommentDTO[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);

  const [history, setHistory] = useState<ExpenseHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [settling, setSettling] = useState(false);

  // Itemized expenses (receipt-scanned) get a line-item section: read-only rows in view
  // mode, editable ScannedItemsCard in edit mode. itemsLoaded distinguishes "no items" from
  // "haven't fetched yet" so Save knows whether to also call updateGroupExpenseItems.
  const isItemized = expense.split_type === 'itemized';
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [itemsTax, setItemsTax] = useState(0);
  const [itemsDiscount, setItemsDiscount] = useState(0);
  const [itemsLoaded, setItemsLoaded] = useState(false);

  // --- Edit mode — description/date/amount/category plus who-paid/split, reusing the
  // same PaidBySplitSummary tap-to-open pattern the Add Expense dialog uses. Seeded from
  // expense.splits (each member's actual current dollar share, as an 'exact' split) so
  // editing starts from what's really on the expense instead of resetting to an equal guess.
  const [editing, setEditing] = useState(initialMode === 'edit');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editAmount, setEditAmount] = useState(0);
  const [editDate, setEditDate] = useState('');
  const [editPayers, setEditPayers] = useState<PayerSummaryItem[]>([]);
  const [editSplitValue, setEditSplitValue] = useState<SplitEditorValue>({ type: 'equal', entries: [] });
  // Derived directly from editPayers/editSplitValue/editAmount rather than tracked via a
  // callback from the picker — see the matching fix in GroupsPage's Add Expense form for why
  // (Save must reflect the real current state even if the user never opens the popover).
  const editPayersValid = computePayersValid(editPayers, editAmount);
  const editSplitValid = computeSplitValid(editSplitValue, editAmount);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const myEmail = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;

  useEffect(() => {
    if (!open) return;
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
  }, [open, groupId, expense.row_id]);

  useEffect(() => {
    if (!open || !isItemized) return;
    getGroupExpenseItems(groupId, expense.row_id)
      .then((res) => {
        setItems(res.items.map((it) => ({
          line_no: it.line_no,
          item_name: it.item_name,
          line_total: it.line_total,
          quantity: it.quantity,
          unit_price: it.unit_price,
          normalized_name: it.normalized_name || undefined,
        })));
        setItemsTax(res.tax);
        setItemsDiscount(res.discount);
        setItemsLoaded(true);
      })
      .catch(() => {});
  }, [open, groupId, expense.row_id, isItemized]);

  const startEdit = React.useCallback(() => {
    setEditDescription(expense.description);
    setEditCategory(expense.category);
    setEditAmount(expense.cost);
    setEditDate(mmddyyyyToISO(expense.date));
    setEditPayers(expense.payer_summary.map((p) => ({ ...p })));
    setEditSplitValue({ type: 'exact', entries: expense.splits.map((s) => ({ member_id: s.member_id, value: s.share })) });
    setEditError(null);
    setEditing(true);
  }, [expense]);

  useEffect(() => {
    if (open && initialMode === 'edit') startEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMode]);

  // Keeps a single payer's amount in sync with the edited total — see the matching effect
  // in GroupsPage's Add Expense form for why this is needed once the payer amount is hidden
  // behind a popover instead of always visible.
  useEffect(() => {
    setEditPayers((prev) => (prev.length === 1 ? [{ ...prev[0], amount_paid: editAmount }] : prev));
  }, [editAmount]);

  const handleSaveEdit = async () => {
    setEditError(null);
    setSavingEdit(true);
    try {
      if (itemsLoaded && items.length > 0) {
        await updateGroupExpenseItems(groupId, expense.row_id, {
          items: items.map((it) => ({
            line_no: it.line_no,
            item_name: it.item_name,
            normalized_name: it.normalized_name,
            quantity: it.quantity,
            unit_price: it.unit_price,
            line_total: it.line_total,
          })),
          amount: editAmount,
          tax: itemsTax,
          discount: itemsDiscount,
        });
      }
      await updateGroupExpense(groupId, expense.row_id, {
        date: isoToMMDDYYYY(editDate),
        description: editDescription,
        category: editCategory,
        amount: editAmount,
        payers: editPayers,
        split: { type: editSplitValue.type, entries: editSplitValue.entries },
        currency: expense.currency || groupCurrency || undefined,
      });
      setEditing(false);
      onUpdated?.();
    } catch (e) {
      setEditError(e instanceof ApiError ? e.message : 'Failed to update expense');
    } finally {
      setSavingEdit(false);
    }
  };

  const handlePostComment = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      const c = await addExpenseComment(groupId, expense.row_id, newComment.trim());
      setComments((prev) => [...prev, c]);
      setNewComment('');
    } catch (e) {
      setToast({ open: true, message: e instanceof ApiError ? e.message : 'Failed to add comment', severity: 'error' });
    } finally {
      setPosting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteExpenseComment(groupId, expense.row_id, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (e) {
      setToast({ open: true, message: e instanceof ApiError ? e.message : 'Failed to delete comment', severity: 'error' });
    }
  };

  const handleSettleMyShare = async () => {
    if (!myMemberId) return;
    const payerIds = expense.payer_summary.map((p) => p.member_id);
    const payload: { member_id: string; payer_member_id?: string } = { member_id: myMemberId };
    if (payerIds.length > 1) {
      // Ambiguous — default to the largest payer; the user can settle the rest
      // individually with the group's own Settle Up flow if needed.
      const biggest = [...expense.payer_summary].sort((a, b) => b.amount_paid - a.amount_paid)[0];
      payload.payer_member_id = biggest.member_id;
    }
    setSettling(true);
    try {
      await settleExpenseShare(groupId, expense.row_id, payload);
      setToast({ open: true, message: 'Share settled', severity: 'success' });
      onSettled?.();
    } catch (e) {
      setToast({ open: true, message: e instanceof ApiError ? e.message : 'Failed to settle share', severity: 'error' });
    } finally {
      setSettling(false);
    }
  };

  const handleDeleteExpense = async () => {
    setDeleting(true);
    try {
      await deleteGroupExpense(groupId, expense.row_id);
      setToast({ open: true, message: 'Expense deleted', severity: 'success' });
      onDeleted?.();
    } catch (e) {
      setToast({ open: true, message: e instanceof ApiError ? e.message : 'Failed to delete expense', severity: 'error' });
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  const canSettle = !readOnly && !!myMemberId && expense.my_share > 0 && !expense.payer_summary.some((p) => p.member_id === myMemberId);
  const nameFor = (memberId: string) => members.find((m) => m.member_id === memberId)?.display_name || 'Someone';

  return (
    <Drawer
      anchor={isDesktop ? 'right' : 'bottom'}
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: false }}
      PaperProps={{
        sx: {
          width: isDesktop ? 400 : '100%',
          maxWidth: '100%',
          borderTopLeftRadius: isDesktop ? 0 : theme.shape.borderRadius,
          borderTopRightRadius: isDesktop ? 0 : theme.shape.borderRadius,
          p: 3,
        },
      }}
    >
      {!isDesktop && (
        <Box
          sx={{
            width: 36,
            height: 4,
            borderRadius: 999,
            backgroundColor: theme.palette.divider,
            mx: 'auto',
            mb: 2,
          }}
        />
      )}
      {isDesktop && <Toolbar />}

      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {editing ? 'Edit expense' : `${expense.category} · ${expense.date}`}
          </Typography>
          {editing ? (
            <Typography sx={{ ...typeScale.display, color: theme.palette.text.primary }} noWrap>
              {expense.description}
            </Typography>
          ) : (
            <>
              <Typography sx={{ ...typeScale.display, color: theme.palette.text.primary }}>
                {formatMoney(expense.cost, displayCurrency)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {expense.description} · your share {formatMoney(expense.my_share, displayCurrency)}
              </Typography>
            </>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
          {!editing && !readOnly && (
            <IconButton size="small" onClick={startEdit} aria-label="Edit expense">
              <EditRoundedIcon fontSize="small" />
            </IconButton>
          )}
          <IconButton aria-label="close" onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>

      {editing ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label="Description" fullWidth value={editDescription} onChange={(e) => setEditDescription(e.target.value)} required />
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField label="Date" type="date" fullWidth value={editDate} onChange={(e) => setEditDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField
              label="Amount"
              type="number"
              fullWidth
              value={editAmount}
              onChange={(e) => setEditAmount(parseFloat(e.target.value) || 0)}
              inputProps={{ min: 0, step: 0.01, style: tabularNums }}
            />
          </Box>
          <CategoryPickerField
            mainCategory={findMainCategory(editCategory)}
            subcategory={editCategory}
            onChange={(_main, sub) => setEditCategory(sub)}
          />

          <Box sx={sectionCardSx}>
            <PaidBySplitSummary
              amount={editAmount}
              members={members}
              myMemberId={myMemberId}
              payers={editPayers}
              onPayersChange={setEditPayers}
              splitValue={editSplitValue}
              onSplitChange={setEditSplitValue}
              currency={displayCurrency}
            />
          </Box>

          {itemsLoaded && items.length > 0 && (
            <ScannedItemsCard
              items={items}
              onChange={setItems}
              merchant={expense.merchant_name}
              tax={itemsTax}
              discount={itemsDiscount}
              currentAmount={editAmount}
              currency={displayCurrency}
            />
          )}

          {editError && (
            <Typography color="error" variant="body2">
              {editError}
            </Typography>
          )}

          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <Button
              variant="outlined"
              fullWidth
              onClick={() => (initialMode === 'edit' ? onClose() : setEditing(false))}
              disabled={savingEdit}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              fullWidth
              disabled={savingEdit || !editDescription.trim() || !editCategory.trim() || editAmount <= 0 || !editPayersValid || !editSplitValid}
              onClick={handleSaveEdit}
            >
              {savingEdit ? <CircularProgress size={20} sx={{ color: 'inherit' }} /> : 'Save'}
            </Button>
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={sectionCardSx}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
              Paid by {expense.payer_summary.map((p) => `${nameFor(p.member_id)} (${formatMoney(p.amount_paid, displayCurrency)})`).join(', ')}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {expense.splits.map((s) => (
                <Box key={s.member_id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Avatar sx={{ width: 22, height: 22, fontSize: 11, bgcolor: colorFromMemberId(s.member_id) }}>
                    {initialsFromName(nameFor(s.member_id))}
                  </Avatar>
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {nameFor(s.member_id)}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, ...tabularNums }}>
                    {formatMoney(s.share, displayCurrency)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {itemsLoaded && items.length > 0 && (
            <Accordion elevation={0} disableGutters sx={sectionCardSx}>
              <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ minHeight: 0, p: 0 }}>
                <Typography variant="subtitle2">Items ({items.length})</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0, pt: 1.5 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {items.map((it) => (
                    <Box key={it.line_no} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                      <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                        {it.item_name}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, ...tabularNums }}>
                        {formatMoney(it.line_total, displayCurrency)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </AccordionDetails>
            </Accordion>
          )}

          {canSettle && (
            <Button
              variant="outlined"
              startIcon={<HandshakeRoundedIcon />}
              disabled={settling}
              onClick={handleSettleMyShare}
              fullWidth
            >
              {settling ? 'Settling...' : `Settle my ${formatMoney(expense.my_share, displayCurrency)} share`}
            </Button>
          )}

          <Box sx={sectionCardSx}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Comments</Typography>
            {commentsLoading ? (
              <CircularProgress size={20} />
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1.5 }}>
                {comments.length === 0 && (
                  <Typography variant="body2" color="text.secondary">No comments yet.</Typography>
                )}
                {comments.map((c) => (
                  <Box key={c.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2">
                        <strong>{c.author_display_name}</strong> {c.body}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(c.created_at).toLocaleString()}
                      </Typography>
                    </Box>
                    {c.author_display_name && myEmail && !readOnly && (
                      <IconButton size="small" onClick={() => handleDeleteComment(c.id)} aria-label="Delete comment">
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                ))}
              </Box>
            )}
            {!readOnly && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handlePostComment();
                  }}
                />
                <IconButton onClick={handlePostComment} disabled={posting || !newComment.trim()} aria-label="Post comment">
                  <SendRoundedIcon />
                </IconButton>
              </Box>
            )}
          </Box>

          <Accordion elevation={0} disableGutters sx={sectionCardSx}>
            <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} sx={{ minHeight: 0, p: 0 }}>
              <Typography variant="subtitle2">History {history.length > 0 ? `(${history.length})` : ''}</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0, pt: 1.5 }}>
              {historyLoading ? (
                <CircularProgress size={20} />
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {history.map((h, idx) => (
                    <Box key={idx}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {h.actor_display_name} {h.action === 'expense_created' ? 'created this expense' : h.action === 'expense_deleted' ? 'deleted this expense' : 'edited this expense'}
                      </Typography>
                      {Object.entries(h.changed_fields || {}).map(([field, change]: [string, any]) => (
                        <Chip
                          key={field}
                          size="small"
                          sx={{ mr: 0.5, mt: 0.5 }}
                          label={
                            change && typeof change === 'object' && 'from' in change
                              ? `${fieldLabels[field] || field}: ${formatFieldValue(field, change.from, groupCurrency)} → ${formatFieldValue(field, change.to, groupCurrency)}`
                              : `${fieldLabels[field] || field}: ${formatFieldValue(field, change, groupCurrency)}`
                          }
                        />
                      ))}
                      <Typography variant="caption" color="text.secondary" display="block">
                        {new Date(h.created_at).toLocaleString()}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </AccordionDetails>
          </Accordion>

          {!readOnly && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
              {!confirmingDelete ? (
                <Button variant="text" color="error" size="large" onClick={() => setConfirmingDelete(true)} disabled={deleting || settling}>
                  Delete expense
                </Button>
              ) : (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button variant="outlined" fullWidth onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                    Cancel
                  </Button>
                  <Button variant="contained" color="error" fullWidth onClick={handleDeleteExpense} disabled={deleting}>
                    {deleting ? <CircularProgress size={20} sx={{ color: 'inherit' }} /> : 'Confirm delete'}
                  </Button>
                </Box>
              )}
            </Box>
          )}
        </Box>
      )}
    </Drawer>
  );
};

export default ExpenseDetailDialog;
