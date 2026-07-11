import React from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { typeScale } from '../theme';
import SegmentedTabs from '../components/common/SegmentedTabs';
import OverviewTab from '../components/analysis/OverviewTab';
import ItemsTab from '../components/analysis/ItemsTab';
import MerchantsTab from '../components/analysis/MerchantsTab';

type AnalysisTab = 'overview' | 'items' | 'merchants';

/**
 * ExpenseAnalysisPage (TS-DES-106 rebuild, TS-DES-205 tab host) — Overview/Items/Merchants now
 * live as `SubTabBar` panes on one page instead of three separate pages/routes. `Items` and
 * `Merchants` supersede the deleted `ItemInsightsPage`/`MerchantInsightsPage` (`/item-insights`
 * and `/merchant-insights` now redirect here, preserving `?item=`/`?merchant=`).
 */
const ExpenseAnalysisPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: AnalysisTab = tabParam === 'items' ? 'items' : tabParam === 'merchants' ? 'merchants' : 'overview';

  const handleTabChange = (next: AnalysisTab) => {
    const params = new URLSearchParams(searchParams);
    params.delete('item');
    params.delete('merchant');
    if (next === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', next);
    }
    setSearchParams(params, { replace: true });
  };

  return (
    // TS-DES-210 desktop fix: this page was capped at the mobile prototype's 600px card
    // width at every viewport (the same class of bug fixed on Dashboard) — `md`+ now uses
    // the full width the sidebar-aware shell provides, matching DesktopAnalysis.jsx.
    <Box sx={{ maxWidth: { xs: 600, md: '100%' }, mx: { xs: 'auto', md: 0 }, pb: 10, pt: 3, px: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
        <Typography sx={{ ...typeScale.display, fontSize: 28, color: 'text.primary' }}>
          Analysis
        </Typography>
        <Box sx={{ maxWidth: 300 }}>
          <SegmentedTabs<AnalysisTab>
            value={tab}
            onChange={handleTabChange}
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'items', label: 'Items' },
              { value: 'merchants', label: 'Merchants' },
            ]}
            fullWidth
            ariaLabel="Analysis section"
          />
        </Box>
      </Box>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'items' && <ItemsTab />}
      {tab === 'merchants' && <MerchantsTab />}
    </Box>
  );
};

export default ExpenseAnalysisPage;
