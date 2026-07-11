import React from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import PageContainer from '../components/layout/PageContainer';
import SegmentedTabs from '../components/common/SegmentedTabs';
import ProfilePage from './ProfilePage';
import FeatureRequestPage from './FeatureRequestPage';

type AccountTab = 'profile' | 'feedback';

const TAB_OPTIONS: { value: AccountTab; label: string }[] = [
  { value: 'profile', label: 'Profile' },
  { value: 'feedback', label: 'Feedback' },
];

/**
 * TS-DES-202 — hosts the old standalone `/profile` and `/feature-request` pages as tabs of one
 * `/account` route, matching `docs/design/prototypes/v2/Account.jsx`'s `SegmentedTabs` pattern.
 * `Profile` is the default tab. Reuses both pages' content unchanged (routing/hosting change
 * only, not a redesign of either page's internals).
 */
const AccountPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: AccountTab = tabParam === 'feedback' ? 'feedback' : 'profile';

  const handleTabChange = (next: AccountTab) => {
    setSearchParams(next === 'profile' ? {} : { tab: next }, { replace: true });
  };

  return (
    <PageContainer sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
        <SegmentedTabs<AccountTab>
          value={tab}
          onChange={handleTabChange}
          options={TAB_OPTIONS}
          ariaLabel="Account section"
        />
      </Box>
      {tab === 'profile' ? <ProfilePage /> : <FeatureRequestPage />}
    </PageContainer>
  );
};

export default AccountPage;
