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
    { label: 'My Expenses', value: 'personal' },
    { label: 'I Paid', value: 'combined' },
    { label: 'Group Total', value: 'groups' },
  ];

  return (
    <Box>
      <SegmentedTabs
        options={tabs}
        value={value}
        onChange={(v: string) => onChange(v as AnalysisScope)}
      />
      {/* 
        TODO: The lens switch (My Expenses / I Paid / Group Total) is currently 
        aliased to the existing AnalysisScope (personal/combined/groups). 
        Once the backend provides true per-category three-money-view splits 
        (my_share/i_paid/group_total), update this component and its consumers 
        to use the new granular data model instead of changing the global scope.
      */}
      <Typography sx={{ mt: 1, fontSize: 12, color: 'text.secondary', textAlign: 'center' }}>
        {value === 'personal' && 'Showing your personal expenses only.'}
        {value === 'combined' && 'Showing your personal expenses + group expenses you paid for.'}
        {value === 'groups' && 'Showing all group expenses regardless of who paid.'}
      </Typography>
    </Box>
  );
};
