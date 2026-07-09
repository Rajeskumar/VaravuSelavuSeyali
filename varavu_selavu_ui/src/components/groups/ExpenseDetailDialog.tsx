import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  IconButton,
  Divider,
  Chip,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import HandshakeRoundedIcon from '@mui/icons-material/HandshakeRounded';
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
} from '../../api/groups';

interface Props {
  open: boolean;
  onClose: () => void;
  groupId: string;
  expense: GroupExpenseRow;
  members: MemberDTO[];
  myMemberId?: string;
  onSettled?: () => void;
  onDeleted?: () => void;
  setToast: (toast: { open: boolean; message: string; severity: 'success' | 'error' | 'info' }) => void;
}

const fieldLabels: Record<string, string> = {
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

const ExpenseDetailDialog: React.FC<Props> = ({ open, onClose, groupId, expense, members, myMemberId, onSettled, onDeleted, setToast }) => {
  const [comments, setComments] = useState<ExpenseCommentDTO[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);

  const [history, setHistory] = useState<ExpenseHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [settling, setSettling] = useState(false);

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

  const canSettle = !!myMemberId && expense.my_share > 0 && !expense.payer_summary.some((p) => p.member_id === myMemberId);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{expense.description}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Box>
            <Typography variant="body2" color="text.secondary">{expense.category} · {expense.date}</Typography>
            <Typography variant="h6">${expense.cost.toFixed(2)} {expense.currency && expense.currency !== 'USD' ? expense.currency : ''}</Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="body2" color="text.secondary">Your share</Typography>
            <Typography variant="h6">${expense.my_share.toFixed(2)}</Typography>
          </Box>
        </Box>

        {canSettle && (
          <Button
            variant="outlined"
            startIcon={<HandshakeRoundedIcon />}
            disabled={settling}
            onClick={handleSettleMyShare}
            sx={{ mb: 2 }}
          >
            {settling ? 'Settling...' : `Settle my $${expense.my_share.toFixed(2)} share`}
          </Button>
        )}

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" sx={{ mb: 1 }}>Comments</Typography>
        {commentsLoading ? (
          <CircularProgress size={20} />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
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
                {c.author_display_name && myEmail && (
                  <IconButton size="small" onClick={() => handleDeleteComment(c.id)} aria-label="Delete comment">
                    <DeleteOutlineRoundedIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
            ))}
          </Box>
        )}
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

        <Divider sx={{ my: 2 }} />

        <Accordion elevation={0} disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
            <Typography variant="subtitle2">History {history.length > 0 ? `(${history.length})` : ''}</Typography>
          </AccordionSummary>
          <AccordionDetails>
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
                            ? `${fieldLabels[field] || field}: ${formatFieldValue(field, change.from)} → ${formatFieldValue(field, change.to)}`
                            : `${fieldLabels[field] || field}: ${formatFieldValue(field, change)}`
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
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
        <Box>
          {!confirmingDelete ? (
            <Button variant="text" color="error" onClick={() => setConfirmingDelete(true)} disabled={deleting || settling}>
              Delete expense
            </Button>
          ) : (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="contained" color="error" onClick={handleDeleteExpense} disabled={deleting}>
                {deleting ? <CircularProgress size={20} color="inherit" /> : 'Confirm delete'}
              </Button>
              <Button variant="outlined" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                Cancel
              </Button>
            </Box>
          )}
        </Box>
        <Button onClick={onClose} disabled={deleting}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExpenseDetailDialog;
