import React from 'react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import SideNav from './SideNav';

interface Props {
  children: React.ReactNode;
  mobileOpen: boolean;
  handleDrawerToggle: () => void;
}

const MainLayout: React.FC<Props> = ({ children, mobileOpen, handleDrawerToggle }) => {
  return (
    <Box sx={{ display: 'flex' }}>
      <SideNav mobileOpen={mobileOpen} handleDrawerToggle={handleDrawerToggle} />
      <Container maxWidth="lg" sx={{ flexGrow: 1, pb: 4, pt: 3 }}>
        {children}
      </Container>
    </Box>
  );
};

export default MainLayout;
