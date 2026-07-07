import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import ListAltRoundedIcon from '@mui/icons-material/ListAltRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded';
import ShoppingBagRoundedIcon from '@mui/icons-material/ShoppingBagRounded';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import { SvgIconComponent } from '@mui/icons-material';

export interface NavItem {
  label: string;
  icon: SvgIconComponent;
  path: string;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', icon: HomeRoundedIcon, path: '/dashboard' },
  { label: 'Expenses', icon: ListAltRoundedIcon, path: '/expenses' },
  { label: 'Groups', icon: GroupsRoundedIcon, path: '/groups' },
  { label: 'Analysis', icon: InsightsRoundedIcon, path: '/analysis' },
  { label: 'Item Insights', icon: ShoppingBagRoundedIcon, path: '/item-insights' },
  { label: 'Merchant Insights', icon: StorefrontRoundedIcon, path: '/merchant-insights' },
  { label: 'AI Analyst', icon: SmartToyRoundedIcon, path: '/ai-analyst' },
  { label: 'Recurring', icon: AutorenewRoundedIcon, path: '/recurring' },
  { label: 'Submit Idea', icon: LightbulbRoundedIcon, path: '/feature-request' },
];
