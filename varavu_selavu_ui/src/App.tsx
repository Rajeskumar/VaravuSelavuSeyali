import React, { JSX } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Route, Routes, useNavigate, Navigate } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { ThemeProvider, CssBaseline, useTheme, useMediaQuery, IconButton } from '@mui/material';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import MenuIcon from '@mui/icons-material/Menu';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import AddExpensePage from './pages/AddExpensePage';
import ExpenseAnalysisPage from './pages/ExpenseAnalysisPage';
import MainLayout from './components/layout/MainLayout';
import Button from '@mui/material/Button';
import LoginIcon from '@mui/icons-material/Login';
import UserMenu from './components/layout/UserMenu';
import ProfilePage from './pages/ProfilePage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import AIAnalystPage from './pages/AIAnalystPage';
import theme from './theme';
import { logout as apiLogout } from './api/auth';

const RequireAuth: React.FC<{ children: JSX.Element }> = ({ children }) => {
  const token = localStorage.getItem('vs_token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
};

const Root: React.FC = () => {
  const token = localStorage.getItem('vs_token');
  if (token) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Navigate to="/login" replace />;
};

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = React.useState<string | null>(() => localStorage.getItem('vs_user'));
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

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
    const refresh = localStorage.getItem('vs_refresh');
    if (refresh) {
      apiLogout(refresh);
    }
    localStorage.removeItem('vs_user');
    localStorage.removeItem('vs_token');
    localStorage.removeItem('vs_refresh');
    setUser(null);
    window.dispatchEvent(new Event('vs_auth_changed'));
    navigate('/login');
  };

  return (
    <>
      <AppBar
        position="fixed"
        sx={{ zIndex: theme => theme.zIndex.drawer + 1 }}
        color="transparent"
        elevation={0}
      >
        <Toolbar>
          {user && isMobile && (
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <AccountBalanceWalletIcon sx={{ mr: 1 }} />
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
              onClick={() => navigate('/login')}
              sx={{ ml: 2 }}
            >
              Login
            </Button>
          )}
        </Toolbar>
      </AppBar>
      <Toolbar />
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/dashboard" element={<RequireAuth><MainLayout mobileOpen={mobileOpen} handleDrawerToggle={handleDrawerToggle}><DashboardPage /></MainLayout></RequireAuth>} />
        <Route path="/add-expense" element={<RequireAuth><MainLayout mobileOpen={mobileOpen} handleDrawerToggle={handleDrawerToggle}><AddExpensePage /></MainLayout></RequireAuth>} />
        <Route path="/analysis" element={<RequireAuth><MainLayout mobileOpen={mobileOpen} handleDrawerToggle={handleDrawerToggle}><ExpenseAnalysisPage /></MainLayout></RequireAuth>} />
        <Route path="/ai-analyst" element={<RequireAuth><MainLayout mobileOpen={mobileOpen} handleDrawerToggle={handleDrawerToggle}><AIAnalystPage /></MainLayout></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><MainLayout mobileOpen={mobileOpen} handleDrawerToggle={handleDrawerToggle}><ProfilePage /></MainLayout></RequireAuth>} />
      </Routes>
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
      <Router basename="/expense">
        <AppContent />
      </Router>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
