import React from 'react';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';

interface Props {
  email: string;
  onProfile: () => void;
  onFeedback: () => void;
  onHelp: () => void;
  onLogout: () => void;
}

const API_BASE = process.env.REACT_APP_API_BASE_URL || '';

function getInitials(email: string): string {
  const name = email.split('@')[0];
  if (!name) return 'U';
  const parts = name.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name[0]?.toUpperCase() || 'U';
}

const UserMenu: React.FC<Props> = ({ email, onProfile, onFeedback, onHelp, onLogout }) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const handleOpen = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const initials = getInitials(email);

  return (
    <>
      <Tooltip title={email}>
        {/* minWidth/minHeight 44: a standalone header target, so it keeps the
            touch-target minimum even though size="small" shrinks the ripple. */}
        <IconButton onClick={handleOpen} size="small" sx={{ ml: 2, minWidth: 44, minHeight: 44 }} aria-label="Account menu" aria-controls={open ? 'user-menu' : undefined} aria-haspopup="true" aria-expanded={open ? 'true' : undefined}>
          <Avatar sx={{ width: 32, height: 32 }}>{initials}</Avatar>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        id="user-menu"
        open={open}
        onClose={handleClose}
        onClick={handleClose}
        PaperProps={{
          elevation: 0,
          sx: {
            overflow: 'visible',
            mt: 1.5,
            '& .MuiAvatar-root': {
              width: 32,
              height: 32,
              ml: -0.5,
              mr: 1,
            },
            '&:before': {
              content: '""',
              display: 'block',
              position: 'absolute',
              top: 0,
              right: 14,
              width: 10,
              height: 10,
              bgcolor: 'background.paper',
              transform: 'translateY(-50%) rotate(45deg)',
              zIndex: 0,
            },
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem onClick={onProfile}>Profile</MenuItem>
        <MenuItem onClick={onFeedback}>Send feedback</MenuItem>
        {/* The link footer is hidden below `md` (BottomNav owns that space), which left phones
            with no Help/legal route except Profile's bottom section (UI-05). These are the
            same three links, reachable from every authenticated page at every width. */}
        <MenuItem onClick={onHelp}>Help &amp; support</MenuItem>
        <Divider />
        <MenuItem component="a" href={`${API_BASE}/privacy-policy`} target="_blank" rel="noopener noreferrer">
          Privacy policy
        </MenuItem>
        <MenuItem component="a" href={`${API_BASE}/terms-of-service`} target="_blank" rel="noopener noreferrer">
          Terms of service
        </MenuItem>
        <Divider />
        <MenuItem onClick={onLogout}>Log out</MenuItem>
      </Menu>
    </>
  );
};

export default UserMenu;
