import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { typeScale } from '../../theme';

interface PurchaseHistory {
  date: string;
  store_name: string | null;
  unit_price: number | null;
  quantity: number;
}

interface PurchaseTapeProps {
  history: PurchaseHistory[];
}

export const PurchaseTape: React.FC<PurchaseTapeProps> = ({ history }) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1,
        borderTop: `2px dashed ${theme.palette.divider}`,
        overflow: 'hidden',
      }}
    >
      {history.map((h, i) => (
        <Box
          key={i}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.5,
            borderBottom: i < history.length - 1 ? `1px dashed ${theme.palette.divider}` : 'none',
          }}
        >
          <Box>
            <Typography sx={{ fontFamily: typeScale.amount.fontFamily, fontSize: 14, fontWeight: 600, color: 'text.primary' }}>
              {h.store_name || '—'}
            </Typography>
            <Typography sx={{ fontFamily: typeScale.amount.fontFamily, fontSize: 12, color: 'text.secondary' }}>
              {h.date ? new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography
              sx={{
                fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
                fontSize: 15,
                fontWeight: 500,
                color: 'text.primary',
              }}
            >
              ${(h.unit_price ?? 0).toFixed(2)}
            </Typography>
            {h.quantity > 1 && (
              <Typography sx={{ fontFamily: typeScale.amount.fontFamily, fontSize: 11, color: 'text.secondary' }}>
                Qty: {h.quantity}
              </Typography>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
};
