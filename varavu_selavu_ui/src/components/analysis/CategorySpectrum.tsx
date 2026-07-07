import React, { useState } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import ChevronDownIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import ChevronUpIcon from '@mui/icons-material/KeyboardArrowUpRounded';
import { typeScale } from '../../theme';

interface CategorySpectrumProps {
  total: number;
  categoryTotals: { category: string; total: number }[];
  details: Record<string, { date: string; description: string; category: string; cost: number }[]>;
}

// Same as categoryColors from the prototype or theme
const categoryColors: Record<string, string> = {
  'Food & Drink': '#C97B4D',
  'Home': '#7E8CA3',
  'Transportation': '#5E9C8F',
  'Utilities': '#A3A86B',
  'Life': '#C77B9E',
  'Entertainment': '#B98CC2',
  'Other': '#9AA0A6',
};

function getCatColor(cat: string) {
  return categoryColors[cat] || categoryColors['Other'];
}

export const CategorySpectrum: React.FC<CategorySpectrumProps> = ({ total, categoryTotals, details }) => {
  const theme = useTheme();
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  // Sort descending by total
  const sorted = [...categoryTotals].sort((a, b) => b.total - a.total);

  return (
    <Box sx={{ px: 2, pb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 2 }}>
        <Typography sx={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'text.secondary', textTransform: 'uppercase' }}>
          CATEGORY BREAKDOWN
        </Typography>
        <Typography sx={{ ...typeScale.display, fontSize: 22, color: 'text.primary' }}>
          ${total.toFixed(2)}
        </Typography>
      </Box>

      {/* The Spectrum Bar */}
      <Box sx={{ display: 'flex', w: '100%', mb: 2, height: 10, borderRadius: 999, overflow: 'hidden', backgroundColor: theme.palette.divider }}>
        {sorted.map(c => {
          const pct = total > 0 ? (c.total / total) * 100 : 0;
          return (
            <Box key={c.category} sx={{ width: `${pct}%`, backgroundColor: getCatColor(c.category) }} />
          );
        })}
      </Box>

      {/* The Ranked Rows */}
      <Box>
        {sorted.map(c => {
          const isExpanded = expandedCat === c.category;
          const pct = total > 0 ? Math.round((c.total / total) * 100) : 0;
          const txns = details[c.category] || [];

          return (
            <Box key={c.category} sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}>
              <Box
                component="button"
                onClick={() => setExpandedCat(isExpanded ? null : c.category)}
                sx={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  py: 1.5,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  outline: 'none',
                  my: 1.5
                }}
              >
                <Box sx={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, backgroundColor: getCatColor(c.category) }} />
                <Typography sx={{ flex: 1, textAlign: 'left', fontFamily: 'Inter', fontSize: 14, color: 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.category}
                </Typography>
                
                <Box sx={{ width: 60, height: 6, borderRadius: 999, backgroundColor: theme.palette.divider, overflow: 'hidden', flexShrink: 0 }}>
                  <Box sx={{ width: `${pct}%`, height: '100%', backgroundColor: getCatColor(c.category) }} />
                </Box>
                
                <Typography sx={{ ...typeScale.amount, width: 64, textAlign: 'right', fontSize: 14, color: 'text.primary' }}>
                  ${c.total.toFixed(2)}
                </Typography>
                
                {isExpanded ? (
                  <ChevronUpIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                ) : (
                  <ChevronDownIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                )}
              </Box>
              
              {isExpanded && (
                <Box sx={{ pl: 3.5, pb: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {txns.length > 0 ? (
                    txns.map((t, i) => (
                      <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontFamily: 'Inter', fontSize: 13, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', mr: 2 }}>
                          {t.description}
                        </Typography>
                        <Typography sx={{ ...typeScale.amount, fontSize: 13, color: 'text.primary' }}>
                          ${t.cost.toFixed(2)}
                        </Typography>
                      </Box>
                    ))
                  ) : (
                    <Typography sx={{ fontFamily: 'Inter', fontSize: 13, color: 'text.secondary' }}>
                      No recent transactions
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Typography sx={{ py: 3, textAlign: 'center', fontFamily: 'Inter', fontSize: 12, color: 'text.secondary' }}>
        Tap a category to see its transactions
      </Typography>
    </Box>
  );
};
