import React from 'react';
import PageContainer from '../components/layout/PageContainer';
import ProfilePage from './ProfilePage';

/**
 * TS-DES-202 — hosts the old standalone `/profile` page at `/account`. Used to also host a
 * "Feedback" tab (FeatureRequestPage); that moved to the avatar dropdown's FeedbackDialog
 * (see UserMenu.tsx/App.tsx), so this is back to a single-purpose Profile host.
 */
const AccountPage: React.FC = () => (
  <PageContainer sx={{ mt: 4 }}>
    <ProfilePage />
  </PageContainer>
);

export default AccountPage;
