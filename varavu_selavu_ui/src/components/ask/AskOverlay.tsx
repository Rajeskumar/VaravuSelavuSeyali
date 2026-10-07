import { useChatConversation } from '../../hooks/useChatConversation';
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
  initialQueryId?: number;
}

/**
 * TS-DES-207 — the ambient Ask panel. Desktop: a right-anchored slide-in sharing the shell's
 * layout (per `desktop/DesktopAskOverlay.jsx`'s reference — a panel beside content, not a
 * centered modal dialog). Mobile: a bottom sheet (majority-height), matching "chat is a layer,
 * not a room" — summoned from anywhere, not a dedicated screen. Both variants wrap the same
 * `AIAnalystChat` component TS-DES-109 already built; only the surrounding chrome differs here.
 *
 * Mount lazily on first open, then keep the conversation alive while this account is signed in.
 */
const AskOverlay: React.FC<AskOverlayProps> = ({ open, onClose, initialQuery, initialQueryId }) => {
  const conversation = useChatConversation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [activated, setActivated] = React.useState(open);
  React.useEffect(() => { if (open) setActivated(true); }, [open]);
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;

  return (
    <Drawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={open}
      ModalProps={{ keepMounted: activated }}
      onClose={onClose}
      PaperProps={{ role: 'dialog', 'aria-modal': true, 'aria-label': 'Ask' }}
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
        {(open || activated) && user && <AIAnalystChat key={user} conversation={conversation} userId={user} initialQueryId={initialQueryId} initialQuery={initialQuery} onClose={onClose} />}
      </Box>
    </Drawer>
  );
};

export default AskOverlay;
