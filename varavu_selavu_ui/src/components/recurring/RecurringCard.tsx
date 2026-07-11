import React from 'react';
import { Box, Typography, Switch, useTheme, IconButton, Menu, MenuItem, ButtonBase } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVertRounded';
import EditIcon from '@mui/icons-material/EditRounded';
import DeleteIcon from '@mui/icons-material/DeleteRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { RecurringTemplateDTO } from '../../api/recurring';
import { typeScale } from '../../theme';

interface RecurringCardProps {
  item: RecurringTemplateDTO;
  onToggle: (item: RecurringTemplateDTO, newStatus: string) => void;
  onEdit: (item: RecurringTemplateDTO) => void;
  onDelete: (item: RecurringTemplateDTO) => void;
  onRunNow?: (item: RecurringTemplateDTO) => void;
}

function getNextDue(dayOfMonth: number): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
  if (next < now) {
    next.setMonth(next.getMonth() + 1);
  }
  return next.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const RecurringCard: React.FC<RecurringCardProps> = ({ item, onToggle, onEdit, onDelete, onRunNow }) => {
  const theme = useTheme();
  const isActive = item.status === 'Active';
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [justRun, setJustRun] = React.useState(false);

  
  const handleMenuClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  return (
    <Box
      sx={{
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1.2,
        p: 2,
        mb: 2,
        position: 'relative'
      }}
    >
      <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
        <IconButton size="small" onClick={handleMenuClick}>
          <MoreVertIcon fontSize="small" />
        </IconButton>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
        >
          <MenuItem onClick={() => { handleMenuClose(); onEdit(item); }}>
            <EditIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> Edit
          </MenuItem>
          <MenuItem onClick={() => { handleMenuClose(); onDelete(item); }} sx={{ color: 'error.main' }}>
            <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Delete
          </MenuItem>
        </Menu>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.5, pr: 4 }}>
        <Typography sx={{ fontFamily: 'Inter', fontSize: 15, fontWeight: 600, color: 'text.primary' }}>
          {item.description}
        </Typography>
        <Typography
          sx={{
            ...typeScale.amount,
            fontSize: 15,
            color: 'text.primary',
            whiteSpace: 'nowrap'
          }}
        >
          ${item.default_cost.toFixed(2)}/mo
        </Typography>
      </Box>
      
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontFamily: 'Inter', fontSize: 13, color: 'text.secondary' }}>
          {item.category}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isActive && onRunNow && (
            <ButtonBase
              onClick={() => {
                if (justRun) return;
                setJustRun(true);
                onRunNow(item);
                setTimeout(() => setJustRun(false), 2000);
              }}
              sx={{
                fontFamily: 'Inter', fontSize: 11, fontWeight: 600,
                color: justRun ? 'success.main' : 'text.primary',
                border: `1px solid ${justRun ? theme.palette.success.main : theme.palette.divider}`,
                backgroundColor: justRun ? `${theme.palette.success.main}14` : 'background.paper',
                padding: '2px 8px', borderRadius: 999,
                display: 'flex', alignItems: 'center', gap: 0.5,
              }}
            >
              {justRun ? <CheckRoundedIcon sx={{ fontSize: 12 }} /> : <PlayArrowRoundedIcon sx={{ fontSize: 12 }} />}
              {justRun ? 'Logged' : 'Run now'}
            </ButtonBase>
          )}
          {isActive ? (
            <Typography
              component="span"
              sx={{
                fontFamily: 'Inter',
                fontSize: 11,
                fontWeight: 600,
                color: 'success.main',
                backgroundColor: `${theme.palette.success.main}14`,
                padding: '3px 8px',
                borderRadius: 999,
              }}
            >
              Due {getNextDue(item.day_of_month)}
            </Typography>
          ) : (
            <Typography
              component="span"
              sx={{
                fontFamily: 'Inter',
                fontSize: 11,
                fontWeight: 600,
                color: 'text.secondary',
                backgroundColor: theme.palette.divider,
                padding: '3px 8px',
                borderRadius: 999,
              }}
            >
              Paused
            </Typography>
          )}
        </Box>
      </Box>
      
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mt: 2,
          pt: 1.5,
          borderTop: `1px solid ${theme.palette.divider}`
        }}
      >
        <Typography sx={{ fontFamily: 'Inter', fontSize: 13, color: 'text.secondary' }}>
          Charges on the {ordinal(item.day_of_month)}
        </Typography>
        <Switch
          checked={isActive}
          onChange={(e) => onToggle(item, e.target.checked ? 'Active' : 'Paused')}
          size="small"
          color="primary"
          sx={{ mr: -1 }} // offset default padding
        />
      </Box>
    </Box>
  );
};
