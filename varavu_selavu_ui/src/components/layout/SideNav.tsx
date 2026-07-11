import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { navItems } from './navItems';

export const drawerWidth = 280;
/** TS-DES-210 — permanent desktop sidebar width (~220–240px per `desktop/*.jsx`'s `Sidebar`). */
export const desktopSidebarWidth = 232;

interface SideNavProps {
  mobileOpen: boolean;
  handleDrawerToggle: () => void;
}

/** Shared nav-item list/active-state logic — both the mobile drawer and the desktop permanent
 * rail render this, so shrinking/reordering `navItems` (TS-DES-202) updates both for free. */
const NavList: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const location = useLocation();
  return (
    <List sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, px: 1 }}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = location.pathname.startsWith(item.path);
        return (
          <ListItemButton key={item.path} selected={active} onClick={() => onNavigate(item.path)} sx={{ mx: 0.5 }}>
            <ListItemIcon sx={{ minWidth: 40 }}>
              <Icon />
            </ListItemIcon>
            <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 600 }} />
          </ListItemButton>
        );
      })}
    </List>
  );
};

/**
 * App navigation — a temporary (overlay) drawer at narrow viewports, a permanent (docked) rail
 * at desktop widths (TS-DES-210, replacing `NavPills` in the top bar at those widths). Both
 * variants are always mounted; CSS `display` picks which one is visible, the same pattern this
 * component already used pre-210 for its single temporary variant — avoids a JS breakpoint
 * branch and any hydration/flash-of-wrong-nav concern.
 */
const SideNav: React.FC<SideNavProps> = ({ mobileOpen, handleDrawerToggle }) => {
  const navigate = useNavigate();

  return (
    <>
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: 'border-box',
            p: 1.5,
          },
        }}
      >
        <Toolbar />
        <Box sx={{ px: 1, py: 1 }}>
          <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.06em' }}>
            Menu
          </Typography>
        </Box>
        <NavList
          onNavigate={(path) => {
            navigate(path);
            handleDrawerToggle();
          }}
        />
      </Drawer>

      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: desktopSidebarWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: desktopSidebarWidth,
            boxSizing: 'border-box',
            position: 'relative',
            border: 'none',
            borderRight: '1px solid',
            borderColor: 'divider',
            pt: 2,
          },
        }}
      >
        <NavList onNavigate={(path) => navigate(path)} />
      </Drawer>
    </>
  );
};

export default SideNav;
