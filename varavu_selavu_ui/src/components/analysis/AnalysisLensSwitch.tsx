import React from 'react';
import { Box, Typography } from '@mui/material';
import { AnalysisScope } from '../../api/analysis';
import SegmentedTabs from '../common/SegmentedTabs';

interface AnalysisLensSwitchProps {
  value: AnalysisScope;
  onChange: (val: AnalysisScope) => void;
}

export const AnalysisLensSwitch: React.FC<AnalysisLensSwitchProps> = ({ value, onChange }) => {
  const tabs = [
    { label: 'My Expenses', value: 'combined' },
    { label: 'I Paid', value: 'i_paid' },
    { label: 'Group Total', value: 'group_total' },
  ];

  return (
    <Box>
      <SegmentedTabs
        options={tabs}
        value={value}
        onChange={(v: string) => onChange(v as AnalysisScope)}
      />
      {/* 
        TODO: The lens switch used to be aliased to the personal/combined/groups 
        scope. It now uses true per-category three-money-view splits 
        (combined/i_paid/group_total) which is fully supported by the backend.
      */}
      <Typography sx={{ mt: 1, fontSize: 12, color: 'text.secondary', textAlign: 'center' }}>
        {value === 'combined' && 'Showing your personal expenses + group expenses assigned to you.'}
        {value === 'i_paid' && 'Showing your personal expenses + group expenses you actually paid for.'}
        {value === 'group_total' && 'Showing your personal expenses + total cost of group expenses.'}
      </Typography>
    </Box>
  );
};
