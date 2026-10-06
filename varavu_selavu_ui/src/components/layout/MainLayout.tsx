import React from 'react';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Zoom from '@mui/material/Zoom';
import AddIcon from '@mui/icons-material/Add';
import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useLocation } from 'react-router-dom';
import SideNav from './SideNav';
import BottomNav from './BottomNav';
import Footer from './Footer';
import PageContainer from './PageContainer';
import { useQuickCapture } from '../../context/QuickCaptureContext';
import { HEADER_HEIGHT, BOTTOM_NAV_HEIGHT } from './layoutConstants';

interface Props {
  children: React.ReactNode;
}

/**
 * Mobile-only "Add Expense" FAB (TrackSpense v3 design) — desktop's equivalent is the header
 * "+ New expense" button (App.tsx) instead of a floating corner button; the design's desktop
 * shell has no FAB at all. Both open the single shared QuickCaptureSheet via QuickCaptureContext
 * rather than each owning their own dialog state.
 */
const MainLayout: React.FC<Props> = ({ children }) => {
  const theme = useTheme();
  // Matches SideNav/App.tsx's own mobile-chrome breakpoint, so the FAB and the nav chrome
  // around it switch at the same width.
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // The floating Add button sits over the right edge of the page, where category amounts and
  // percentages are; bottom padding can't stop it covering them at intermediate scroll
  // positions. Hide it while the user scrolls down to read and bring it back on scroll-up (or at
  // the top), the usual pattern for this control.
  const [fabVisible, setFabVisible] = React.useState(true);
  React.useEffect(() => {
    if (!isMobile) return;
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      if (y < 80 || delta < -6) setFabVisible(true);
      else if (delta > 6) setFabVisible(false);
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isMobile]);
  const { openQuickCapture } = useQuickCapture();
  const location = useLocation();
  // The FAB means "Add expense" — on screens whose own task is a different kind of creation
  // or editing (Profile, the Cards catalog/custom-card form) it floated over those forms and
  // read as belonging to them (UI-04). Hide it there; BottomNav still gives one-tap access to
  // Expenses/Dashboard where it makes sense.
  const onNonLedgerScreen =
    location.pathname.startsWith('/account') ||
    location.pathname.startsWith('/profile') ||
    location.pathname.startsWith('/contact') ||
    (location.pathname.startsWith('/analysis') && new URLSearchParams(location.search).get('tab') === 'cards');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: `calc(100vh - ${HEADER_HEIGHT}px)` }}>
      {/* TS-DES-210 — full-viewport-width shell: sidebar + content column span the entire
          available width at every desktop size, not the desktop prototypes' bounded "card"
          (that bounding is a mockup-viewing convention, not a spec — see TS-DES-210's ticket).
          Only page *content* inside PageContainer optionally caps at a reading width. Footer is
          a sibling of this row (not nested in the content column), matching the reference
          prototypes' shell — it spans the full width, under the sidebar too. */}
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <SideNav />
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Extra bottom padding clears BottomNav + its higher-riding FAB below `md`
              (TrackSpense v3 Mobile); desktop has no floating chrome to clear. */}
          <PageContainer
            sx={{
              pb: { xs: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom) + 32px)`, md: 4 },
              pt: 4,
              flex: 1,
            }}
          >
            {children}
          </PageContainer>
        </Box>
      </Box>
      <Footer />
      <BottomNav />

      {isMobile && !onNonLedgerScreen && (
        <Zoom in={fabVisible}>
          <Fab
            color="primary"
            aria-label="Add Expense"
            onClick={() => openQuickCapture()}
            sx={{
              position: 'fixed',
              bottom: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom) + 16px)`,
              right: 24,
              zIndex: (t) => t.zIndex.speedDial,
            }}
          >
            <AddIcon />
          </Fab>
        </Zoom>
      )}
    </Box>
  );
};

export default MainLayout;
