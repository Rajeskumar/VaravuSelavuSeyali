import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { navItems } from './navItems';
import { BOTTOM_NAV_HEIGHT } from './layoutConstants';

/**
 * Persistent mobile bottom tab bar (TrackSpense v3 Mobile design) — replaces the hamburger
 * drawer below `md`, per the mock's own "Groups is a first-class tab, never buried in a
 * drawer" thesis. Maps over the same `navItems` SideNav's permanent desktop rail uses, so
 * adding/reordering a destination there updates both for free.
 */
const BottomNav: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Box
      component="nav"
      aria-label="Primary"
      sx={{
        display: { xs: 'flex', md: 'none' },
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: (t) => t.zIndex.appBar,
        backgroundColor: isDark ? 'rgba(5,6,10,0.85)' : 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid',
        borderColor: 'divider',
        pb: 'env(safe-area-inset-bottom)',
      }}
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = location.pathname.startsWith(item.path);
        return (
          <Box
            key={item.path}
            role="link"
            aria-current={active ? 'page' : undefined}
            onClick={() => navigate(item.path)}
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.25,
              height: BOTTOM_NAV_HEIGHT,
              cursor: 'pointer',
              userSelect: 'none',
              color: active ? 'primary.main' : 'text.secondary',
            }}
          >
            <Icon sx={{ fontSize: 22 }} />
            <Typography sx={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1 }}>
              {item.label}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
};

export default BottomNav;
