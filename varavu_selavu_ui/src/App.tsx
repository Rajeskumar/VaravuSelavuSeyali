import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Route, Routes, useNavigate } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { ThemeProvider, CssBaseline } from '@mui/material';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AddExpensePage from './pages/AddExpensePage';
import ExpenseAnalysisPage from './pages/ExpenseAnalysisPage';
import MainLayout from './components/layout/MainLayout';
import Button from '@mui/material/Button';
import LoginIcon from '@mui/icons-material/Login';
import UserMenu from './components/layout/UserMenu';
import ProfilePage from './pages/ProfilePage';
import AIAnalystPage from './pages/AIAnalystPage';
import theme from './theme';

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
      <AppBar position="fixed" sx={{ zIndex: theme => theme.zIndex.drawer + 1 }}>
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
      <Toolbar />
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/dashboard" element={<MainLayout><DashboardPage /></MainLayout>} />
        <Route path="/add-expense" element={<MainLayout><AddExpensePage /></MainLayout>} />
        <Route path="/analysis" element={<MainLayout><ExpenseAnalysisPage /></MainLayout>} />
        <Route path="/ai-analyst" element={<MainLayout><AIAnalystPage /></MainLayout>} />
        <Route path="/profile" element={<MainLayout><ProfilePage /></MainLayout>} />
      </Routes>
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
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <AppContent />
      </Router>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
