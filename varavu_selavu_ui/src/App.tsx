import React, { JSX } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Route, Routes, useNavigate, useLocation, Navigate } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import { IconButton, Tooltip } from '@mui/material';

import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ExpensesPage from './pages/ExpensesPage';
import ExpenseAnalysisPage from './pages/ExpenseAnalysisPage';
import HomePage from './pages/HomePage';
import MainLayout from './components/layout/MainLayout';
import Button from '@mui/material/Button';
import LoginIcon from '@mui/icons-material/Login';
import UserMenu from './components/layout/UserMenu';
import FeedbackDialog from './components/layout/FeedbackDialog';
import AccountPage from './pages/AccountPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import AskPage from './pages/AskPage';
import { ThemeModeProvider, useThemeMode } from './context/ThemeModeContext';
import AmbientBackground from './components/common/AmbientBackground';
import { QuickCaptureProvider, useQuickCapture } from './context/QuickCaptureContext';
import { AskProvider, useAsk } from './context/AskContext';
import { useQuickLogBar } from './hooks/useQuickLogBar';
import WillLogPreview from './components/common/WillLogPreview';
import { logout as apiLogout } from './api/auth';
import RecurringPrompt from './components/expenses/RecurringPrompt';
import ContactPage from './pages/ContactPage';
import GroupsPage from './pages/GroupsPage';
import JoinGroupPage from './pages/JoinGroupPage';
import Box from '@mui/material/Box';
import { HEADER_HEIGHT } from './components/layout/layoutConstants';

const RequireAuth: React.FC<{ children: JSX.Element }> = ({ children }) => {
  const token = localStorage.getItem('vs_token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
};

// Home is now the default route and is public
const Root: React.FC = () => <HomePage />;

// TS-DES-207: /ai-analyst → /ask, preserving ?q=... so existing "Ask AI about this item/merchant"
// deep links (now repointed at /ask directly, but this covers any stale bookmark) still auto-submit.
const AiAnalystRedirect: React.FC = () => {
  const location = useLocation();
  return <Navigate to={`/ask${location.search}`} replace />;
};

// TS-DES-205: /item-insights and /merchant-insights → /analysis?tab=items|merchants, preserving
// ?item=/?merchant= so existing deep links still land on the right detail view, not just the tab.
const ItemInsightsRedirect: React.FC = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('tab', 'items');
  return <Navigate to={`/analysis?${params.toString()}`} replace />;
};
const MerchantInsightsRedirect: React.FC = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('tab', 'merchants');
  return <Navigate to={`/analysis?${params.toString()}`} replace />;
};

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = React.useState<string | null>(() => localStorage.getItem('vs_user'));
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  const { isDark, toggleMode } = useThemeMode();
  const { openQuickCapture } = useQuickCapture();
  const { openAsk } = useAsk();
  // Desktop-only header equivalent of the mobile Dashboard's TypeToLogBar (TrackSpense v3
  // Prototype) — same shared parsing/submit hook, just a different input/preview shell.
  const quickLog = useQuickLogBar();

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
      <AmbientBackground />
      <AppBar
        position="fixed"
        sx={{ zIndex: theme => theme.zIndex.drawer + 1 }}
        color="transparent"
        elevation={0}
      >
        <Toolbar sx={{ gap: 1.5, minHeight: { xs: 56, md: HEADER_HEIGHT } }}>
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            <Box
              component="img"
              src="/icon.png"
              alt="TrackSpense Logo"
              sx={{
                width: 30,
                height: 30,
                borderRadius: '8px',
                objectFit: 'cover'
              }}
            />
            {/* Hidden below `sm`: the logo wordmark + Ask/theme/avatar icons can
                otherwise exceed a narrow phone's width and wrap the Toolbar onto a
                second line — since the fixed AppBar and its spacer share one hardcoded
                height, a wrapped header silently overlaps whatever renders at the very
                top of the page below it (e.g. Dashboard's hero total). */}
            <Typography
              variant="h6"
              component="div"
              sx={{ fontWeight: 700, letterSpacing: '-0.02em', display: { xs: 'none', sm: 'block' } }}
            >
              TrackSpense
            </Typography>
          </Box>

          {/* TS-DES-210: nav lives in the permanent desktop sidebar / mobile drawer now
              (SideNav.tsx), not a horizontal NavPills row in the header. Below `md` this is a
              plain spacer pushing the trailing icons/buttons to the end of the bar; at `md`+ it
              hosts the type-to-log bar (TrackSpense v3 Prototype) — same shared parser/save
              path as mobile Dashboard's TypeToLogBar, just living in the header instead. */}
          <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', minWidth: 0 }}>
            {user && (
              <TextField
                size="small"
                value={quickLog.text}
                onChange={(e) => quickLog.setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') quickLog.submit(); }}
                placeholder="✨ Log or ask anything… “dinner 84.20 at Nopa split with Weekend Trip”"
                sx={{
                  display: { xs: 'none', md: 'block' },
                  width: '100%',
                  maxWidth: 560,
                  '& .MuiOutlinedInput-root': { borderRadius: 999, bgcolor: 'background.default' },
                }}
              />
            )}
          </Box>

          {/* TrackSpense v3 Prototype (desktop) — the header's fast expense-entry point,
              replacing the old desktop FAB (mobile keeps its own FAB in the bottom-tab bar;
              this button is desktop-only so the two don't duplicate). Opens the same shared
              QuickCaptureSheet every other "+ Add expense" entry point in the app now uses. */}
          {user && (
            <Button
              variant="contained"
              size="small"
              startIcon={<AddRoundedIcon />}
              onClick={() => openQuickCapture()}
              sx={{ display: { xs: 'none', md: 'inline-flex' }, borderRadius: 999 }}
            >
              New expense
            </Button>
          )}

          {/* TS-DES-210/207: Ask's entry point — a header icon next to the theme toggle and
              avatar (desktop), not a floating button. Shown at every width, not just desktop —
              mobile has no other trigger for its summonable-sheet variant of the same
              AskOverlay. */}
          {user && (
            <Tooltip title="Ask AI">
              <IconButton color="inherit" onClick={() => openAsk()} aria-label="Ask AI">
                <AutoAwesomeRoundedIcon />
              </IconButton>
            </Tooltip>
          )}

          <Tooltip title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
            <IconButton color="inherit" onClick={toggleMode} aria-label="Toggle color mode">
              {isDark ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
            </IconButton>
          </Tooltip>
          {user ? (
            <UserMenu
              email={user}
              onProfile={() => navigate('/account')}
              onFeedback={() => setFeedbackOpen(true)}
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
      {/* Spacer — must match the AppBar Toolbar's own height exactly (HEADER_HEIGHT at desktop) so
          routed content starts right below the fixed header with no gap/overlap. */}
      <Toolbar sx={{ minHeight: { xs: 56, md: HEADER_HEIGHT } }} />
      {user && quickLog.parsed && (
        <Box sx={{ display: { xs: 'none', md: 'block' } }}>
          <WillLogPreview
            parsed={quickLog.parsed}
            memberCount={quickLog.memberCount}
            submitting={quickLog.submitting}
            onSubmit={quickLog.submit}
            variant="strip"
          />
        </Box>
      )}
      {user && quickLog.isQuestion && (
        <Box sx={{ display: { xs: 'none', md: 'flex' }, justifyContent: 'center', py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">
            Press Enter to ask the AI
          </Typography>
        </Box>
      )}
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        {/* Public: logged-out visitors' only path to support — /email/send itself has no auth
            requirement either. Logged-in users get a faster path via the avatar menu's Feedback
            dialog (FeedbackDialog, opened from UserMenu) instead of this page. */}
        <Route path="/contact" element={<ContactPage />} />
        {/* Public: must be reachable pre-login (deep link from an invite email/text); resumes after auth via LoginPage. */}
        <Route path="/groups/join/:token" element={<JoinGroupPage />} />
        <Route path="/dashboard" element={<RequireAuth><MainLayout><DashboardPage /></MainLayout></RequireAuth>} />
        <Route path="/expenses" element={<RequireAuth><MainLayout><ExpensesPage /></MainLayout></RequireAuth>} />
        <Route path="/groups" element={<RequireAuth><MainLayout><GroupsPage /></MainLayout></RequireAuth>} />
        <Route path="/groups/:id" element={<RequireAuth><MainLayout><GroupsPage /></MainLayout></RequireAuth>} />
        <Route path="/analysis" element={<RequireAuth><MainLayout><ExpenseAnalysisPage /></MainLayout></RequireAuth>} />
        {/* TS-DES-204: Recurring is now a sub-tab of Expenses, not a standalone page. */}
        <Route path="/recurring" element={<Navigate to="/expenses?tab=recurring" replace />} />
        <Route path="/ask" element={<RequireAuth><MainLayout><AskPage /></MainLayout></RequireAuth>} />
        {/* TS-DES-207: AI Analyst is no longer a nav tab or dedicated page destination — this
            redirect exists purely for old bookmarks/links, preserving ?q=... */}
        <Route path="/ai-analyst" element={<AiAnalystRedirect />} />
        {/* TS-DES-205: Item/Merchant Insights are no longer standalone pages — they're the
            Items/Merchants tabs on /analysis. */}
        <Route path="/item-insights" element={<ItemInsightsRedirect />} />
        <Route path="/merchant-insights" element={<MerchantInsightsRedirect />} />
        <Route path="/account" element={<RequireAuth><MainLayout><AccountPage /></MainLayout></RequireAuth>} />
        {/* TS-DES-202: /profile is no longer a primary nav destination — folds into /account's
            default Profile tab. Redirect shim so no existing bookmark/link 404s. */}
        <Route path="/profile" element={<Navigate to="/account" replace />} />
      </Routes>
      {/* Recurring expenses prompt appears after login */}
      {user && <RecurringPrompt />}
      {user && <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />}
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
        <AskProvider>
          <QuickCaptureProvider>
            <AppContent />
          </QuickCaptureProvider>
        </AskProvider>
      </Router>
    </ThemeModeProvider>
  </QueryClientProvider>
);

export default App;
