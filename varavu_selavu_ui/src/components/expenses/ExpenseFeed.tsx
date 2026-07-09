import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import EditIcon from '@mui/icons-material/EditRounded';
import DeleteIcon from '@mui/icons-material/DeleteRounded';
import { useTheme } from '@mui/material/styles';
import { typeScale, tabularNums } from '../../theme';
import { categoryTint } from './categoryColors';
import { parseAppDate } from '../../utils/date';

/**
 * Unified feed row shape — one type for personal, group, and combined scopes
 * (TS-DES-102). `kind` distinguishes which delete/edit path a row's actions
 * should call (personal expenses vs a specific group's expense endpoint);
 * everything else renders identically regardless of scope.
 */
export interface FeedExpense {
  /** Unique across the whole feed — used as the React key and detail-sheet identity. */
  key: string;
  kind: 'personal' | 'group';
  /** Underlying id to pass to update/delete calls (number for personal, string for group). */
  id: number | string;
  /** Set only for kind === 'group' — needed to call the group expense endpoints. */
  groupId?: string;
  date: string; // MM/DD/YYYY or YYYY-MM-DD (parseAppDate handles both)
  description: string;
  merchantName?: string;
  category: string; // subcategory
  mainCategory: string;
  /** The amount to render as the row's primary tabular figure (full cost for
   * personal rows, "my share" for group rows). */
  amount: number;
  /** Only set for group rows — the full/group amount, rendered as a secondary caption. */
  groupAmount?: number;
  groupName?: string;
  notes?: string;
  /** Only set for group rows — the original payer(s), preserved as-is when an
   * edit re-submits the (Phase-1, always-equal) split. See ExpensesPage's
   * `handleDetailSave` for why this is threaded through rather than rebuilt. */
  payerSummary?: { member_id: string; amount_paid: number }[];
}

interface DayGroup {
  dateKey: string;
  label: string;
  items: FeedExpense[];
  subtotal: number;
}

function dayLabel(d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cmp = new Date(d);
  cmp.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - cmp.getTime()) / 86400000);
  if (diffDays === 0) return 'TODAY';
  if (diffDays === 1) return 'YESTERDAY';
  return cmp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

function groupByDay(expenses: FeedExpense[]): DayGroup[] {
  const withDates = expenses.map((e) => ({ e, d: parseAppDate(e.date) }));
  withDates.sort((a, b) => b.d.getTime() - a.d.getTime());
  const map = new Map<string, { d: Date; items: FeedExpense[] }>();
  for (const { e, d } of withDates) {
    const dateKey = Number.isNaN(d.getTime()) ? 'unknown' : d.toDateString();
    if (!map.has(dateKey)) map.set(dateKey, { d, items: [] });
    map.get(dateKey)!.items.push(e);
  }
  return Array.from(map.entries()).map(([dateKey, { d, items }]) => ({
    dateKey,
    label: Number.isNaN(d.getTime()) ? 'UNDATED' : dayLabel(d),
    items,
    subtotal: items.reduce((s, e) => s + e.amount, 0),
  }));
}

export function formatMoney(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

interface ExpenseRowProps {
  expense: FeedExpense;
  onSelect: (expense: FeedExpense) => void;
  onEdit: (expense: FeedExpense) => void;
  onDelete: (expense: FeedExpense) => void;
  deleting: boolean;
}

const ExpenseRow: React.FC<ExpenseRowProps> = ({ expense, onSelect, onEdit, onDelete, deleting }) => {
  const theme = useTheme();
  const dot = categoryTint(expense.mainCategory);
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={() => onSelect(expense)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(expense);
      }}
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2.5,
        py: 1.5,
        cursor: 'pointer',
        borderBottom: `1px solid ${theme.palette.divider}`,
        transition: 'background-color 0.15s ease',
        '&:hover': { backgroundColor: theme.palette.action.hover },
        '&:hover .expense-row-actions': { opacity: 1, pointerEvents: 'auto' },
        '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: -2 },
      }}
    >
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          flexShrink: 0,
          backgroundColor: dot,
        }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 15 }} noWrap>
          {expense.merchantName || expense.description}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap component="div">
          {expense.kind === 'group' ? expense.groupName : expense.category}
        </Typography>
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          flexShrink: 0,
          // Slide the amount out of the way on hover so the reveal actions
          // don't overlap it (desktop hover-reveal per the ticket).
          transition: 'transform 0.15s ease, opacity 0.15s ease',
        }}
        className="expense-row-amount"
      >
        <Typography sx={{ ...typeScale.amount, color: theme.palette.text.primary }}>
          {formatMoney(expense.amount)}
        </Typography>
        {expense.kind === 'group' && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
          >
            <span aria-hidden>◐</span> my expense
            {typeof expense.groupAmount === 'number' && (
              <span style={tabularNums as React.CSSProperties}>· {formatMoney(expense.groupAmount)} total</span>
            )}
          </Typography>
        )}
      </Box>
      <Box
        className="expense-row-actions"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          ml: 0.5,
          opacity: 0,
          pointerEvents: 'none',
          transition: 'opacity 0.15s ease',
          // Always visible on touch/coarse-pointer devices where hover doesn't apply.
          '@media (hover: none)': { opacity: 1, pointerEvents: 'auto' },
        }}
      >
        <IconButton
          aria-label="edit"
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(expense);
          }}
        >
          <EditIcon fontSize="small" sx={{ color: isDark ? theme.palette.primary.light : theme.palette.primary.main }} />
        </IconButton>
        <IconButton
          aria-label="delete"
          size="small"
          disabled={deleting}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(expense);
          }}
        >
          {deleting ? <CircularProgress size={16} /> : <DeleteIcon fontSize="small" color="error" />}
        </IconButton>
      </Box>
    </Box>
  );
};

interface ExpenseFeedProps {
  expenses: FeedExpense[];
  loading?: boolean;
  emptyMessage?: string;
  onSelect: (expense: FeedExpense) => void;
  onEdit: (expense: FeedExpense) => void;
  onDelete: (expense: FeedExpense) => void;
  deletingKey?: string | null;
  /** Called when the sentinel at the bottom of the feed enters the viewport —
   * used to drive infinite scroll instead of a "Load More" button. */
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}

/**
 * Day-grouped expense feed (TS-DES-102) — the single rendering path for the
 * personal/groups/combined scopes on ExpensesPage, replacing the old
 * scope-conditional `<Table>` and `<Box>`-row list. Matches
 * `docs/design/prototypes/ExpenseFeed.jsx`: sticky day header with a daily
 * subtotal, category tint dot, tabular-nums amounts, hover-reveal edit/delete
 * (desktop), tap-to-open detail sheet (wired by the parent via `onSelect`).
 */
const ExpenseFeed: React.FC<ExpenseFeedProps> = ({
  expenses,
  loading,
  emptyMessage = 'No expenses in this scope',
  onSelect,
  onEdit,
  onDelete,
  deletingKey,
  onLoadMore,
  hasMore,
  loadingMore,
}) => {
  const theme = useTheme();
  const groups = React.useMemo(() => groupByDay(expenses), [expenses]);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!onLoadMore || !hasMore) return undefined;
    const node = sentinelRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: '200px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, groups.length]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }

  if (groups.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">{emptyMessage}</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        borderRadius: `${theme.shape.borderRadius}px`,
        border: `1px solid ${theme.palette.divider}`,
        overflow: 'hidden',
        backgroundColor: theme.palette.background.paper,
      }}
    >
      {groups.map((group) => (
        <Box key={group.dateKey}>
          <Box
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2.5,
              py: 1,
              backgroundColor: theme.palette.mode === 'dark' ? theme.palette.background.default : '#EFEFEA',
              borderBottom: `1px solid ${theme.palette.divider}`,
            }}
          >
            <Typography sx={{ ...typeScale.label, color: theme.palette.text.secondary }}>{group.label}</Typography>
            <Typography variant="caption" sx={{ ...tabularNums, fontWeight: 600, color: theme.palette.text.secondary }}>
              {formatMoney(group.subtotal)}
            </Typography>
          </Box>
          {group.items.map((expense) => (
            <ExpenseRow
              key={expense.key}
              expense={expense}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
              deleting={deletingKey === expense.key}
            />
          ))}
        </Box>
      ))}
      {hasMore && (
        <Box ref={sentinelRef} sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          {loadingMore && <CircularProgress size={18} />}
        </Box>
      )}
    </Box>
  );
};

export default ExpenseFeed;
