import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';

interface EmptyStateProps {
  /** Optional leading icon — pass a MUI icon element; it's sized/coloured here. */
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  /** Lower-emphasis second action, e.g. "Clear filters" or "Create a group". */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Tighter vertical padding for inline/rail placements. */
  compact?: boolean;
}

/**
 * One empty-state pattern for the whole app (design review 2026-09, UI-08): title, a short
 * explanation, and a contextual primary action, with an optional secondary action. Callers
 * pick copy for the three distinct situations — first use ("nothing yet, here's how to
 * start"), a filter that matched nothing ("clear it"), and not enough history ("come back
 * after a few entries") — rather than showing the same bare "No X" line for all three.
 */
const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  compact,
}) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      gap: 1,
      px: 2,
      py: compact ? 3 : 6,
    }}
  >
    {icon && (
      <Box sx={{ color: 'text.disabled', '& svg': { fontSize: compact ? 32 : 44 }, mb: 0.5 }}>{icon}</Box>
    )}
    <Typography sx={{ fontWeight: 700, fontSize: compact ? 14 : 16 }}>{title}</Typography>
    {description && (
      <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 360, lineHeight: 1.55 }}>
        {description}
      </Typography>
    )}
    {(actionLabel || secondaryLabel) && (
      <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
        {actionLabel && onAction && (
          <Button variant="contained" size={compact ? 'small' : 'medium'} onClick={onAction}>
            {actionLabel}
          </Button>
        )}
        {secondaryLabel && onSecondary && (
          <Button variant="text" size={compact ? 'small' : 'medium'} onClick={onSecondary} sx={{ color: 'text.secondary' }}>
            {secondaryLabel}
          </Button>
        )}
      </Box>
    )}
  </Box>
);

export default EmptyState;
