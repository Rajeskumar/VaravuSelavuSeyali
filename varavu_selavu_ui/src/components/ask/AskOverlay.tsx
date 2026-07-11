import React from 'react';
import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import { useTheme, useMediaQuery } from '@mui/material';
import AIAnalystChat from '../ai-analyst/AIAnalystChat';
import { HEADER_HEIGHT } from '../layout/layoutConstants';

interface AskOverlayProps {
  open: boolean;
  onClose: () => void;
  initialQuery?: string;
}

/**
 * TS-DES-207 — the ambient Ask panel. Desktop: a right-anchored slide-in sharing the shell's
 * layout (per `desktop/DesktopAskOverlay.jsx`'s reference — a panel beside content, not a
 * centered modal dialog). Mobile: a bottom sheet (majority-height), matching "chat is a layer,
 * not a room" — summoned from anywhere, not a dedicated screen. Both variants wrap the same
 * `AIAnalystChat` component TS-DES-109 already built; only the surrounding chrome differs here.
 *
 * Deliberately NOT `keepMounted` — `AIAnalystChat` fires a `getModels()` API call on mount, so
 * eagerly mounting it before the user ever opens Ask would fire that call (and, unauthenticated,
 * error) on every single page load. MUI's default lazy-mount means the conversation resets each
 * time the panel closes; an acceptable trade-off for an ambient "layer," not a persistent room.
 */
const AskOverlay: React.FC<AskOverlayProps> = ({ open, onClose, initialQuery }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;

  return (
    <Drawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={open}
      onClose={onClose}
      sx={{
        // The app's fixed AppBar sits at a higher z-index than MUI's default Drawer z-index
        // (App.tsx deliberately sets `theme.zIndex.drawer + 1`), so without a top offset the
        // panel's own header (title, Fast/Deep picker, close button) renders behind it.
        '& .MuiDrawer-paper': isMobile
          ? { height: '85vh', borderTopLeftRadius: 16, borderTopRightRadius: 16 }
          : { top: HEADER_HEIGHT, height: `calc(100% - ${HEADER_HEIGHT}px)`, width: 400, maxWidth: '90vw' },
      }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <AIAnalystChat userId={user} initialQuery={initialQuery} onClose={onClose} />
      </Box>
    </Drawer>
  );
};

export default AskOverlay;
