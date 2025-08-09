import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Route, Routes, useNavigate } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import AddExpensePage from './pages/AddExpensePage';
import ExpenseAnalysisPage from './pages/ExpenseAnalysisPage';
import Navbar from './components/layout/Navbar';
import Button from '@mui/material/Button';
import LoginIcon from '@mui/icons-material/Login';
import UserMenu from './components/layout/UserMenu';
import ProfilePage from './pages/ProfilePage';

const AppContent: React.FC = () => {
  // const [footerValue, setFooterValue] = React.useState(0);
  const navigate = useNavigate();
  const [user, setUser] = React.useState<string | null>(() => localStorage.getItem('vs_user'));

  // Update when localStorage changes from other tabs
  React.useEffect(() => {
    const onStorage = () => setUser(localStorage.getItem('vs_user'));
    window.addEventListener('storage', onStorage);
    window.addEventListener('vs_auth_changed', onStorage as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('vs_auth_changed', onStorage as EventListener);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('vs_user');
    localStorage.removeItem('vs_token');
    setUser(null);
    window.dispatchEvent(new Event('vs_auth_changed'));
    navigate('/');
  };

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Varavu Selavu
          </Typography>
          {user ? (
            <UserMenu
              email={user}
              onProfile={() => navigate('/profile')}
              onLogout={handleLogout}
            />
          ) : (
            <Button
              color="inherit"
              startIcon={<LoginIcon />}
              onClick={() => navigate('/')}
              sx={{ ml: 2 }}
            >
              Login
            </Button>
          )}
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
          <Route path="/profile" element={
            <>
              <Navbar />
              <ProfilePage />
            </>
          } />
        </Routes>
      </Container>
      {/*<Box sx={{ width: '100%', position: 'fixed', bottom: 0 }}>*/}
      {/*  <BottomNavigation*/}
      {/*    showLabels*/}
      {/*    value={footerValue}*/}
      {/*    onChange={(event, newValue) => setFooterValue(newValue)}*/}
      {/*  >*/}
      {/*    <BottomNavigationAction label="Home" icon={<HomeIcon />} />*/}
      {/*    <BottomNavigationAction label="Add" icon={<AddCircleIcon />} />*/}
      {/*    <BottomNavigationAction label="Recent" icon={<RestoreIcon />} />*/}
      {/*  </BottomNavigation>*/}
      {/*</Box>*/}
    </>
  );
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 1 minute
      gcTime: 5 * 60_000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <Router>
      <AppContent />
    </Router>
  </QueryClientProvider>
);

export default App;
