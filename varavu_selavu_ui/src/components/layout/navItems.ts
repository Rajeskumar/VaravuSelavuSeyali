import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import ListAltRoundedIcon from '@mui/icons-material/ListAltRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import { SvgIconComponent } from '@mui/icons-material';

export interface NavItem {
  label: string;
  icon: SvgIconComponent;
  path: string;
}

// TS-DES-202 — shrunk from 9 entries to 4, per Redesign_Proposal_v2.md §3. Item Insights,
// Merchant Insights, AI Analyst, Recurring, and Submit Idea are no longer primary nav
// destinations: the first two fold into Analysis as sub-tabs (TS-DES-205), Recurring folds into
// Expenses as a sub-tab (TS-DES-204), AI Analyst becomes an ambient overlay (TS-DES-207), and
// Submit Idea moves under the Account menu (this ticket, via the new /account route's Feedback
// tab). Both SideNav.tsx (mobile drawer) and NavPills.tsx (desktop pills) read this same array.
export const navItems: NavItem[] = [
  { label: 'Dashboard', icon: HomeRoundedIcon, path: '/dashboard' },
  { label: 'Expenses', icon: ListAltRoundedIcon, path: '/expenses' },
  { label: 'Analysis', icon: InsightsRoundedIcon, path: '/analysis' },
  { label: 'Groups', icon: GroupsRoundedIcon, path: '/groups' },
];
