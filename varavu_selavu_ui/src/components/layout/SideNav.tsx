import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Toolbar from '@mui/material/Toolbar';
import HomeIcon from '@mui/icons-material/Home';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import InsightsIcon from '@mui/icons-material/Insights';
import SmartToyIcon from '@mui/icons-material/SmartToy';

export const drawerWidth = 220;

const navItems = [
  { label: 'Dashboard', icon: <HomeIcon />, path: '/dashboard' },
  { label: 'Add Expense', icon: <AddCircleIcon />, path: '/add-expense' },
  { label: 'Analysis', icon: <InsightsIcon />, path: '/analysis' },
  { label: 'AI Analyst', icon: <SmartToyIcon />, path: '/ai-analyst' },
];

const SideNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: {
          width: drawerWidth,
          boxSizing: 'border-box',
          p: 1,
        },
      }}
    >
      <Toolbar />
      <List>
        {navItems.map(item => (
          <ListItemButton
            key={item.path}
            selected={location.pathname.startsWith(item.path)}
            onClick={() => navigate(item.path)}
            sx={{
              mx: 1,
              my: 0.5,
              borderRadius: '24px',
              '&.Mui-selected': {
                background: 'linear-gradient(135deg, rgba(79,70,229,0.4), rgba(20,184,166,0.4))',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                '& .MuiListItemIcon-root, & .MuiListItemText-primary': {
                  color: 'primary.main',
                },
              },
            }}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
    </Drawer>
  );
};

export default SideNav;
