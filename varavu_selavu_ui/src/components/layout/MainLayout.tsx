import React from 'react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import SideNav from './SideNav';

interface Props {
  children: React.ReactNode;
}

const MainLayout: React.FC<Props> = ({ children }) => {
  return (
    <Box sx={{ display: 'flex' }}>
      <SideNav />
      <Container maxWidth="lg" sx={{ flexGrow: 1, pb: 4, pt: 3 }}>
        {children}
      </Container>
    </Box>
  );
};

export default MainLayout;
