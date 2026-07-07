import React, { useMemo, useRef, useEffect } from 'react';
import { Box, Typography, useTheme } from '@mui/material';

interface TrendNavigatorProps {
  monthlyTrend: { month: string; total: number }[];
  selectedMonth: number; // 1-12
  year: number;
  onSelect: (month: number) => void;
}

export const TrendNavigator: React.FC<TrendNavigatorProps> = ({ monthlyTrend, selectedMonth, year, onSelect }) => {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Create a 12-month array of totals for the year
  const allMonths = useMemo(() => {
    const arr = Array.from({ length: 12 }, (_, i) => ({
      monthNum: i + 1,
      short: new Date(year, i, 1).toLocaleDateString(undefined, { month: 'short' }),
      total: 0,
    }));
    monthlyTrend.forEach(m => {
      // month is 'YYYY-MM'
      const [y, mm] = m.month.split('-');
      if (parseInt(y, 10) === year) {
        const idx = parseInt(mm, 10) - 1;
        if (idx >= 0 && idx < 12) {
          arr[idx].total = m.total;
        }
      }
    });
    return arr;
  }, [monthlyTrend, year]);

  const displayMonths = useMemo(() => {
    const now = new Date();
    if (year === now.getFullYear()) {
      return allMonths.slice(0, now.getMonth() + 1);
    }
    return allMonths;
  }, [allMonths, year]);

  // Find the maximum total to scale the bars
  const max = Math.max(...displayMonths.map(m => m.total), 1);

  // Scroll to center the selected month
  useEffect(() => {
    if (containerRef.current && selectedRef.current) {
      const container = containerRef.current;
      const btn = selectedRef.current;
      const containerCenter = container.clientWidth / 2;
      const btnCenter = btn.offsetLeft + btn.clientWidth / 2;
      // Use smooth scroll behavior
      container.scrollTo({
        left: btnCenter - containerCenter,
        behavior: 'smooth'
      });
    }
  }, [selectedMonth, year, displayMonths.length]);

  return (
    <Box sx={{ px: 2, pb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'text.secondary', textTransform: 'uppercase' }}>
          SPEND OVER TIME · tap a month
        </Typography>
      </Box>
      <Box 
        ref={containerRef}
        sx={{ 
          display: 'flex', 
          alignItems: 'flex-end', 
          gap: 1, 
          height: 96, 
          overflowX: 'auto',
          '&::-webkit-scrollbar': { display: 'none' }, 
          msOverflowStyle: 'none', 
          scrollbarWidth: 'none' 
        }}
      >
        {displayMonths.map((m) => {
          const isSel = m.monthNum === selectedMonth;
          const barH = Math.max(6, (m.total / max) * 64);
          
          return (
            <Box
              key={m.monthNum}
              ref={isSel ? selectedRef : undefined}
              component="button"
              onClick={() => onSelect(m.monthNum)}
              sx={{
                flexShrink: 0,
                width: '15%',
                minWidth: 48,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                height: '100%',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <Box sx={{ height: 16, display: 'flex', alignItems: 'flex-end', mb: 0.5 }}>
                {isSel && (
                  <Typography sx={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 600, color: 'text.primary' }}>
                    ${m.total >= 1000 ? `${(m.total/1000).toFixed(1)}k` : Math.round(m.total)}
                  </Typography>
                )}
              </Box>
              <Box
                sx={{
                  width: '100%',
                  maxWidth: 32,
                  height: barH,
                  borderRadius: 1,
                  backgroundColor: isSel ? theme.palette.text.primary : theme.palette.divider,
                  transition: 'height 200ms ease-out, background-color 200ms ease-out',
                  '&:hover': {
                    backgroundColor: isSel ? theme.palette.text.primary : theme.palette.action.hover,
                  }
                }}
              />
              <Typography
                sx={{
                  mt: 1,
                  fontFamily: 'Inter',
                  fontSize: 11,
                  fontWeight: isSel ? 600 : 400,
                  color: isSel ? 'text.primary' : 'text.secondary',
                }}
              >
                {m.short}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
