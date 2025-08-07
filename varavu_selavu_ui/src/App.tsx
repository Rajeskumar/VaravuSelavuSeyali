import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import RestoreIcon from '@mui/icons-material/Restore';
import HomeIcon from '@mui/icons-material/Home';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import AddExpensePage from './pages/AddExpensePage';
import ExpenseAnalysisPage from './pages/ExpenseAnalysisPage';
import Navbar from './components/layout/Navbar';

const App: React.FC = () => {
  const [footerValue, setFooterValue] = React.useState(0);
  return (
    <Router>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Varavu Selavu
          </Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ minHeight: '80vh', pb: 4 }}>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route 
            path="/home" 
            element={ 
              <>
                <Navbar />
                <HomePage />
              </>
            }
          />
          <Route 
            path="/add-expense" 
            element={
              <>
                <Navbar />
                <AddExpensePage />
              </>
            }
          />
          <Route path="/analysis" element={
            <>
              <Navbar />
              <ExpenseAnalysisPage />
            </>
          } />
        </Routes>
      </Container>
      <Box sx={{ width: '100%', position: 'fixed', bottom: 0 }}>
        <BottomNavigation
          showLabels
          value={footerValue}
          onChange={(event, newValue) => setFooterValue(newValue)}
        >
          <BottomNavigationAction label="Home" icon={<HomeIcon />} />
          <BottomNavigationAction label="Add" icon={<AddCircleIcon />} />
          <BottomNavigationAction label="Recent" icon={<RestoreIcon />} />
        </BottomNavigation>
      </Box>
    </Router>
  );
};

export default App;
