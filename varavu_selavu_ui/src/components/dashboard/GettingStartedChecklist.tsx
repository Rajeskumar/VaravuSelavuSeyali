import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/CloseRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { cerebro } from '../../theme';

const DISMISSED_KEY = 'vs_getting_started_dismissed_v1';

export interface ChecklistStep {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  onClick: () => void;
}

/**
 * First-run checklist (readiness review 2026-10-05): the empty dashboard only offered "Add your
 * first expense", so new users never found groups, budgets or Card Coach. Lists the product's
 * pillars that are enabled, ticks them off as they're done, and disappears once all are done or
 * the user dismisses it.
 */
const GettingStartedChecklist: React.FC<{ steps: ChecklistStep[] }> = ({ steps }) => {
  const [dismissed, setDismissed] = React.useState(() => {
    try {
      return !!localStorage.getItem(DISMISSED_KEY);
    } catch {
      return false;
    }
  });
  const doneCount = steps.filter((s) => s.done).length;
  if (dismissed || steps.length === 0 || doneCount === steps.length) return null;

  return (
    <Box
      component="section"
      aria-label="Getting started"
      sx={{
        backgroundColor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: `${cerebro.radius.surface}px`,
        p: 2,
        mb: 3,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Get started</Typography>
          <Typography variant="caption" color="text.secondary">
            {doneCount} of {steps.length} done
          </Typography>
        </Box>
        <IconButton
          size="small"
          aria-label="Dismiss getting started"
          onClick={() => {
            try {
              localStorage.setItem(DISMISSED_KEY, '1');
            } catch {
              /* ignore */
            }
            setDismissed(true);
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {steps.map((s) => (
          <Box component="li" key={s.key}>
            <Box
              component="button"
              type="button"
              onClick={s.onClick}
              disabled={s.done}
              sx={{
                all: 'unset',
                boxSizing: 'border-box',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                py: 1,
                px: 0.5,
                borderRadius: 1,
                cursor: s.done ? 'default' : 'pointer',
                '&:hover': s.done ? undefined : { bgcolor: 'action.hover' },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
              }}
            >
              {s.done ? (
                <CheckCircleRoundedIcon fontSize="small" color="success" />
              ) : (
                <RadioButtonUncheckedRoundedIcon fontSize="small" sx={{ color: 'text.disabled' }} />
              )}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  sx={{ fontSize: 14, fontWeight: 600, color: s.done ? 'text.secondary' : 'text.primary', textDecoration: s.done ? 'line-through' : 'none' }}
                >
                  {s.label}
                </Typography>
                {!s.done && (
                  <Typography variant="caption" color="text.secondary">
                    {s.hint}
                  </Typography>
                )}
              </Box>
              {!s.done && <ChevronRightRoundedIcon fontSize="small" sx={{ color: 'text.secondary' }} />}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default GettingStartedChecklist;
