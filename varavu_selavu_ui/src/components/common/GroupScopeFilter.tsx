import React from 'react';
import { AnalysisScope } from '../../api/analysis';
import SegmentedTabs from './SegmentedTabs';

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
  <SegmentedTabs<AnalysisScope>
    value={value}
    onChange={onChange}
    size={size}
    ariaLabel="Spend scope"
    options={[
      { value: 'personal', label: 'Personal' },
      { value: 'groups', label: 'Groups' },
      { value: 'combined', label: 'Combined' },
    ]}
  />
);

export default GroupScopeFilter;
