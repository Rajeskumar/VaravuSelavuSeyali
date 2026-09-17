import React from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/CloseRounded';

interface FormSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

/**
 * The one "form" surface pattern (design review 2026-09, UI-10): a centered dialog on desktop
 * and a bottom sheet on phones — the split QuickCaptureSheet already made, now shared so the
 * recurring-expense and budget forms stop opening as a drag-handled phone sheet on a 1280px
 * screen. Header (title + close) is owned here so every form places it the same way; callers
 * supply the body, including their own primary action at the bottom.
 */
const FormSheet: React.FC<FormSheetProps> = ({ open, onClose, title, children }) => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  const header = (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
      <Typography sx={{ fontFamily: 'Instrument Sans', fontSize: 18, fontWeight: 700, color: 'text.primary' }}>
        {title}
      </Typography>
      <IconButton onClick={onClose} aria-label="Close" size="small" sx={{ mr: -1, color: 'text.secondary' }}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </Box>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 2 } }}>
        <Box sx={{ px: 3, pt: 2.5, pb: 3 }}>
          {header}
          {children}
        </Box>
      </Dialog>
    );
  }

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          width: '100%',
          maxHeight: '92vh',
        },
      }}
    >
      <Box sx={{ px: 3, pt: 2, pb: `calc(24px + env(safe-area-inset-bottom))`, overflowY: 'auto' }}>
        <Box sx={{ width: 40, height: 4, bgcolor: 'divider', borderRadius: 2, mx: 'auto', mb: 3 }} />
        {header}
        {children}
      </Box>
    </Drawer>
  );
};

export default FormSheet;
