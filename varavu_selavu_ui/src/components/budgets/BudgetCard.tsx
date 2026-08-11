import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import MoreVertIcon from '@mui/icons-material/MoreVertRounded';
import EditIcon from '@mui/icons-material/EditRounded';
import DeleteIcon from '@mui/icons-material/DeleteRounded';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesomeRounded';
import { useNavigate } from 'react-router-dom';
import { BudgetDTO } from '../../api/budgets';
import BudgetProgressBar, { formatBudgetMoney } from './BudgetProgressBar';

interface BudgetCardProps {
  budget: BudgetDTO;
  onEdit: (budget: BudgetDTO) => void;
  onDelete: (budget: BudgetDTO) => void;
}

/** Mirrors RecurringCard.tsx's card shell (header/body/footer, "⋮" edit-delete menu) so Budgets
 * reads as native to the app rather than a bolted-on surface (PRD §6 design principle). */
const BudgetCard: React.FC<BudgetCardProps> = ({ budget, onEdit, onDelete }) => {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const title = budget.target_type === 'overall' ? 'Overall' : budget.category || 'Budget';

  // §5.4 "Ask why" — hands off to the existing /ask chat surface (same pattern ItemsTab's/
  // MerchantsTab's "Ask AI" chips already use) with a budget-shaped question pre-filled, rather
  // than a new bespoke AI endpoint.
  const askWhy = () => {
    const question =
      budget.status === 'exceeded' || budget.status === 'over_pace'
        ? `Why am I over my ${title} budget this month?`
        : `How is my ${title} budget doing this month?`;
    navigate(`/ask?q=${encodeURIComponent(question)}`);
  };

  return (
    <Box
      sx={{
        backgroundColor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1.2,
        p: 2,
        mb: 2,
        position: 'relative',
      }}
    >
      <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
        <IconButton size="small" onClick={(e) => setAnchorEl(e.currentTarget)}>
          <MoreVertIcon fontSize="small" />
        </IconButton>
        <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
          <MenuItem onClick={() => { setAnchorEl(null); onEdit(budget); }}>
            <EditIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> Edit
          </MenuItem>
          <MenuItem onClick={() => { setAnchorEl(null); onDelete(budget); }} sx={{ color: 'error.main' }}>
            <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Delete
          </MenuItem>
        </Menu>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, pr: 4 }}>
        <Typography sx={{ fontFamily: 'Instrument Sans', fontSize: 15, fontWeight: 600, color: 'text.primary' }}>
          {title}
        </Typography>
        <Chip
          size="small"
          label={budget.scope === 'combined' ? 'Combined' : 'Personal'}
          sx={{ height: 18, fontSize: 10.5, fontWeight: 700, bgcolor: 'action.hover' }}
        />
      </Box>

      <BudgetProgressBar spent={budget.spent} amount={budget.amount} status={budget.status} />

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mt: 1.5,
          pt: 1.25,
          borderTop: '1px solid',
          borderColor: 'divider',
          gap: 1,
        }}
      >
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
          {budget.is_snapshot
            ? 'Final for this period'
            : `Projected ${formatBudgetMoney(budget.projected)}${budget.committed > 0 ? ` · ${formatBudgetMoney(budget.committed)} committed` : ''}`}
        </Typography>
        <Box
          component="button"
          onClick={askWhy}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: 'primary.main',
            fontSize: 11.5,
            fontWeight: 600,
            p: 0,
            flexShrink: 0,
          }}
        >
          <AutoAwesomeIcon sx={{ fontSize: 13 }} /> Ask why
        </Box>
      </Box>
    </Box>
  );
};

export default BudgetCard;
