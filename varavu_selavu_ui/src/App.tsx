import React, { JSX } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Route, Routes, useNavigate, Navigate } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { useTheme, useMediaQuery, IconButton, Tooltip } from '@mui/material';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import MenuIcon from '@mui/icons-material/Menu';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ExpensesPage from './pages/ExpensesPage';
import ExpenseAnalysisPage from './pages/ExpenseAnalysisPage';
import HomePage from './pages/HomePage';
import RecurringPage from './pages/RecurringPage';
import MainLayout from './components/layout/MainLayout';
import Button from '@mui/material/Button';
import LoginIcon from '@mui/icons-material/Login';
import UserMenu from './components/layout/UserMenu';
import ProfilePage from './pages/ProfilePage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import AIAnalystPage from './pages/AIAnalystPage';
import ItemInsightsPage from './pages/ItemInsightsPage';
import MerchantInsightsPage from './pages/MerchantInsightsPage';
import { ThemeModeProvider, useThemeMode } from './context/ThemeModeContext';
import { logout as apiLogout } from './api/auth';
import RecurringPrompt from './components/expenses/RecurringPrompt';
import FeatureRequestPage from './pages/FeatureRequestPage';
import NavPills from './components/layout/NavPills';
import Box from '@mui/material/Box';
import { brand } from './theme';

const RequireAuth: React.FC<{ children: JSX.Element }> = ({ children }) => {
  const token = localStorage.getItem('vs_token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
};

// Home is now the default route and is public
const Root: React.FC = () => <HomePage />;

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = React.useState<string | null>(() => localStorage.getItem('vs_user'));
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { isDark, toggleMode } = useThemeMode();

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
        <Toolbar sx={{ gap: 1.5 }}>
          {user && isMobile && (
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            <Box
              sx={{
                width: 30,
                height: 30,
                borderRadius: '9px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundImage: `linear-gradient(135deg, ${brand.gradientStart}, ${brand.gradientEnd})`,
              }}
            >
              <AccountBalanceWalletIcon sx={{ fontSize: 17, color: '#fff' }} />
            </Box>
            <Typography variant="h6" component="div" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
              TrackSpense
            </Typography>
          </Box>

          {user && !isMobile && (
            <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center' }}>
              <NavPills />
            </Box>
          )}
          {(!user || isMobile) && <Box sx={{ flexGrow: 1 }} />}

          <Tooltip title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
            <IconButton color="inherit" onClick={toggleMode}>
              {isDark ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
            </IconButton>
          </Tooltip>
          {user ? (
            <UserMenu
              email={user}
              onProfile={() => navigate('/profile')}
              onLogout={handleLogout}
            />
          ) : (
            <Button
              variant="contained"
              color="primary"
              startIcon={<LoginIcon />}
              onClick={() => navigate('/login')}
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
        <Route path="/feature-request" element={<FeatureRequestPage />} />
        <Route path="/dashboard" element={<RequireAuth><MainLayout mobileOpen={mobileOpen} handleDrawerToggle={handleDrawerToggle}><DashboardPage /></MainLayout></RequireAuth>} />
        <Route path="/expenses" element={<RequireAuth><MainLayout mobileOpen={mobileOpen} handleDrawerToggle={handleDrawerToggle}><ExpensesPage /></MainLayout></RequireAuth>} />
        <Route path="/analysis" element={<RequireAuth><MainLayout mobileOpen={mobileOpen} handleDrawerToggle={handleDrawerToggle}><ExpenseAnalysisPage /></MainLayout></RequireAuth>} />
        <Route path="/recurring" element={<RequireAuth><MainLayout mobileOpen={mobileOpen} handleDrawerToggle={handleDrawerToggle}><RecurringPage /></MainLayout></RequireAuth>} />
        <Route path="/ai-analyst" element={<RequireAuth><MainLayout mobileOpen={mobileOpen} handleDrawerToggle={handleDrawerToggle}><AIAnalystPage /></MainLayout></RequireAuth>} />
        <Route path="/item-insights" element={<RequireAuth><MainLayout mobileOpen={mobileOpen} handleDrawerToggle={handleDrawerToggle}><ItemInsightsPage /></MainLayout></RequireAuth>} />
        <Route path="/merchant-insights" element={<RequireAuth><MainLayout mobileOpen={mobileOpen} handleDrawerToggle={handleDrawerToggle}><MerchantInsightsPage /></MainLayout></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><MainLayout mobileOpen={mobileOpen} handleDrawerToggle={handleDrawerToggle}><ProfilePage /></MainLayout></RequireAuth>} />
      </Routes>
      {/* Recurring expenses prompt appears after login */}
      {user && <RecurringPrompt />}
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
    <ThemeModeProvider>
      <Router>
        <AppContent />
      </Router>
    </ThemeModeProvider>
  </QueryClientProvider>
);

export default App;
