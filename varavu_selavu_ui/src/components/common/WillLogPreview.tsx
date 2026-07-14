import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { formatMoney } from '../expenses/ExpenseFeed';
import { QuickLogParsed } from '../../utils/quickLogParse';

interface WillLogPreviewProps {
  parsed: QuickLogParsed;
  memberCount: number;
  submitting: boolean;
  onSubmit: () => void;
  /** Full-width bar styling (desktop header strip) vs. a compact card under an inline input
   * (mobile Dashboard's TypeToLogBar). */
  variant?: 'card' | 'strip';
}

/** The "✨ WILL LOG" chip-row preview shared by the mobile Dashboard's type-to-log bar and the
 * desktop header's equivalent — see useQuickLogBar.ts for the parsing/submit logic this renders. */
const WillLogPreview: React.FC<WillLogPreviewProps> = ({ parsed, memberCount, submitting, onSubmit, variant = 'card' }) => {
  const isStrip = variant === 'strip';
  const chip = (label: string, value: string) => (
    <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1, py: 0.25, fontSize: 12, whiteSpace: 'nowrap' }}>
      <Box component="span" sx={{ color: 'text.secondary' }}>{label} </Box>
      <Box component="span" sx={{ fontWeight: 700 }}>{value}</Box>
    </Box>
  );

  return (
    <Box
      sx={
        isStrip
          ? { display: 'flex', alignItems: 'center', gap: 1, px: 2.5, py: 1, bgcolor: (t) => (t.palette.mode === 'dark' ? 'action.hover' : 'primary.50'), borderBottom: '1px solid', borderColor: 'divider' }
          : { mt: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1.25, bgcolor: (t) => (t.palette.mode === 'dark' ? 'action.hover' : 'primary.50') }
      }
    >
      <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700, letterSpacing: '0.05em', flexShrink: 0 }}>
        ✨ WILL LOG
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: isStrip ? 0 : 0.75, flex: isStrip ? 1 : undefined }}>
        {chip('Amount', formatMoney(parsed.amount))}
        {parsed.merchant && chip('Merchant', parsed.merchant)}
        {chip('Category', parsed.category)}
        {chip('Split', parsed.groupId ? `${parsed.groupName} · your share ${formatMoney(parsed.amount / Math.max(memberCount, 1))}` : 'Personal')}
      </Box>
      <Box
        onClick={onSubmit}
        sx={{
          display: 'inline-block',
          mt: isStrip ? 0 : 1,
          flexShrink: 0,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          borderRadius: 999,
          px: 2,
          py: 0.75,
          fontSize: 12.5,
          fontWeight: 700,
          cursor: submitting ? 'default' : 'pointer',
          opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting ? 'Logging…' : 'Log it ↵'}
      </Box>
    </Box>
  );
};

export default WillLogPreview;
