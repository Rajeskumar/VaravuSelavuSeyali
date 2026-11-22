import React, { useEffect, useState } from 'react';
import { Button } from '@mui/material';
import { Link } from 'react-router-dom';
import { getConfig } from '../api/config';
import PageContainer from '../components/layout/PageContainer';
import ProfilePage from './ProfilePage';

/**
 * TS-DES-202 — hosts the old standalone `/profile` page at `/account`. Used to also host a
 * "Feedback" tab (FeatureRequestPage); that moved to the avatar dropdown's FeedbackDialog
 * (see UserMenu.tsx/App.tsx), so this is back to a single-purpose Profile host.
 */
const AccountPage: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { getConfig().then(c => setEnabled(!!c.mcp_enabled)).catch(() => {}); }, []);
  return (
  <PageContainer sx={{ mt: 4 }}>
    <ProfilePage />
    {enabled && <Button component={Link} to="/account/assistants">Connected assistants</Button>}
  </PageContainer>
);
};

export default AccountPage;
