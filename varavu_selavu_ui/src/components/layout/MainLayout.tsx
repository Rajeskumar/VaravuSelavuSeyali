import React from 'react';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import AddIcon from '@mui/icons-material/Add';
import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
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
  const { openQuickCapture } = useQuickCapture();

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

      {isMobile && (
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
      )}
    </Box>
  );
};

export default MainLayout;
