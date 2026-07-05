import React from 'react';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { AnalysisScope } from '../../api/analysis';

interface GroupScopeFilterProps {
  value: AnalysisScope;
  onChange: (next: AnalysisScope) => void;
  size?: 'small' | 'medium';
}

/** Personal / Groups / Combined toggle — lives on ExpensesPage and Analysis
 * only, per spec §11.2 (not the dashboard, which is combined-only with no
 * toggle). Callers are expected to only render this once TS-GRP-107's
 * useGroupsEnabled() hook confirms the flag is on. */
const GroupScopeFilter: React.FC<GroupScopeFilterProps> = ({ value, onChange, size = 'small' }) => (
  <ToggleButtonGroup
    size={size}
    exclusive
    value={value}
    onChange={(_, next) => next && onChange(next)}
    aria-label="Spend scope"
  >
    <ToggleButton value="personal">Personal</ToggleButton>
    <ToggleButton value="groups">Groups</ToggleButton>
    <ToggleButton value="combined">Combined</ToggleButton>
  </ToggleButtonGroup>
);

export default GroupScopeFilter;
