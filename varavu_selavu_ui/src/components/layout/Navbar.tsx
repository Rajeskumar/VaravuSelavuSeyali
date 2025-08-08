import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import HomeIcon from '@mui/icons-material/Home';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import InsightsIcon from '@mui/icons-material/Insights';
import LoginIcon from '@mui/icons-material/Login';

const navItems = [
  { label: 'Dashboard', icon: <HomeIcon />, path: '/home' },
  { label: 'Add Expense', icon: <AddCircleIcon />, path: '/add-expense' },
  { label: 'Analysis', icon: <InsightsIcon />, path: '/analysis' },
  { label: 'Login', icon: <LoginIcon />, path: '/' },
];

const Navbar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentTab = navItems.findIndex(item => location.pathname.startsWith(item.path));

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    navigate(navItems[newValue].path);
  };

  return (
    <Tabs
      value={currentTab === -1 ? 0 : currentTab}
      onChange={handleChange}
      indicatorColor="primary"
      textColor="primary"
      sx={{ mb: 3 }}
      aria-label="Main navigation tabs"
    >
      {navItems.map((item, idx) => (
        <Tab key={item.path} label={item.label} icon={item.icon} iconPosition="start" />
      ))}
    </Tabs>
  );
};

export default Navbar;
