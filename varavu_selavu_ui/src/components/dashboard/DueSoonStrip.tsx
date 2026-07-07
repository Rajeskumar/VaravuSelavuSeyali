import React from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { reconcile, typeScale, tabularNums } from '../../theme';
import { RecurringTemplateDTO } from '../../api/recurring';

interface Props {
  templates: RecurringTemplateDTO[];
}

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Next occurrence of `dayOfMonth` on/after `today`, wrapping to next month if
 * that day already passed this month. */
function nextDueDate(dayOfMonth: number, today: Date): Date {
  const thisMonthDue = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
  if (thisMonthDue >= new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
    return thisMonthDue;
  }
  return new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth);
}

function daysUntil(due: Date, today: Date): number {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

const DUE_SOON_LIMIT = 3;

/**
 * Compact "Due Soon" strip (TS-DES-111) — active recurring templates ranked by
 * actual proximity to today, not creation order. Not a revival of the
 * MetricCard-era UpcomingRecurringCard TS-DES-103 removed; a new component
 * matching SpendSpectrum/MyGroupsStrip's flat hairline styling.
 */
const DueSoonStrip: React.FC<Props> = ({ templates }) => {
  const navigate = useNavigate();
  const today = new Date();

  const ranked = templates
    .filter((t) => t.status !== 'Paused')
    .map((t) => {
      const due = nextDueDate(t.day_of_month, today);
      return { ...t, due, days: daysUntil(due, today) };
    })
    .sort((a, b) => a.days - b.days)
    .slice(0, DUE_SOON_LIMIT);

  if (ranked.length === 0) return null;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ ...typeScale.label, color: 'text.secondary' }}>DUE SOON</Typography>
        <Typography
          variant="caption"
          onClick={() => navigate('/recurring')}
          sx={{ color: 'text.secondary', cursor: 'pointer', '&:hover': { color: 'text.primary' } }}
        >
          See all ›
        </Typography>
      </Box>
      <Box
        sx={{
          backgroundColor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: `${reconcile.radius.surface}px`,
          overflow: 'hidden',
        }}
      >
        {ranked.map((t, idx) => (
          <Box
            key={t.id}
            onClick={() => navigate('/recurring')}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 2,
              py: 1.5,
              cursor: 'pointer',
              borderBottom: idx < ranked.length - 1 ? '1px solid' : 'none',
              borderColor: 'divider',
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }} noWrap>
                {t.description}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {t.days === 0 ? 'Due today' : t.days === 1 ? 'Due tomorrow' : `Due in ${t.days} days`}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', ...tabularNums }}>
              {formatMoney(t.default_cost)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default DueSoonStrip;
