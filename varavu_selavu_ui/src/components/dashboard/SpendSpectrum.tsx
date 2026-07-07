import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { typeScale, tabularNums } from '../../theme';

interface CategoryTotal {
  category: string;
  total: number;
}

interface Props {
  data: CategoryTotal[];
  title?: string;
}

/** Deterministic palette-cycling for arbitrary category names — the reference
 * prototype (Dashboard.jsx) hardcodes 5 named categories with fixed colors;
 * real data has arbitrary category names/counts, so this cycles a fixed
 * ramp of Reconcile-adjacent hues rather than assigning a hardcoded color
 * per literal category name. */
const SPECTRUM_PALETTE = ['#C97B4D', '#7E8CA3', '#5E9C8F', '#A3A86B', '#C77B9E', '#6B8CBE', '#B08968', '#8A8FA6'];

function colorFor(index: number): string {
  return SPECTRUM_PALETTE[index % SPECTRUM_PALETTE.length];
}

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Ranked category spectrum (Design Spec §4.3): a proportional stacked bar plus
 * ranked rows with amount + percentage, replacing CategoryBreakdownSunburst as
 * the Dashboard's primary category view (TS-DES-103). */
const SpendSpectrum: React.FC<Props> = ({ data, title = 'WHERE IT WENT' }) => {
  const ranked = [...data].filter((d) => d.total > 0).sort((a, b) => b.total - a.total);
  const total = ranked.reduce((sum, d) => sum + d.total, 0);

  if (ranked.length === 0 || total <= 0) {
    return null;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ ...typeScale.label, color: 'text.secondary' }}>{title}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', ...tabularNums }}>
          {formatMoney(total)}
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'flex',
          width: '100%',
          height: 8,
          borderRadius: 999,
          overflow: 'hidden',
          backgroundColor: 'divider',
          mb: 1.5,
        }}
      >
        {ranked.map((c, i) => (
          <Box key={c.category} sx={{ width: `${(c.total / total) * 100}%`, backgroundColor: colorFor(i) }} />
        ))}
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {ranked.map((c, i) => (
          <Box key={c.category} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: colorFor(i), flexShrink: 0 }} />
            <Typography variant="body2" sx={{ flex: 1, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.category}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', ...tabularNums }}>
              {formatMoney(c.total)}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', width: 34, textAlign: 'right' }}>
              {Math.round((c.total / total) * 100)}%
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default SpendSpectrum;
