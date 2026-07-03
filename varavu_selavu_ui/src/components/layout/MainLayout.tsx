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
    <Box>
      <SideNav mobileOpen={mobileOpen} handleDrawerToggle={handleDrawerToggle} />
      <Container maxWidth="lg" sx={{ pb: 6, pt: 4 }}>
        {children}
      </Container>
    </Box>
  );
};

export default MainLayout;
