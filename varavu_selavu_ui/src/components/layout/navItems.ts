import HomeIcon from '@mui/icons-material/Home';
import ListAltIcon from '@mui/icons-material/ListAlt';
import InsightsIcon from '@mui/icons-material/Insights';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import StorefrontIcon from '@mui/icons-material/Storefront';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import { SvgIconComponent } from '@mui/icons-material';

export interface NavItem {
  label: string;
  icon: SvgIconComponent;
  path: string;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', icon: HomeIcon, path: '/dashboard' },
  { label: 'Expenses', icon: ListAltIcon, path: '/expenses' },
  { label: 'Analysis', icon: InsightsIcon, path: '/analysis' },
  { label: 'Item Insights', icon: ShoppingCartIcon, path: '/item-insights' },
  { label: 'Merchant Insights', icon: StorefrontIcon, path: '/merchant-insights' },
  { label: 'AI Analyst', icon: SmartToyIcon, path: '/ai-analyst' },
  { label: 'Recurring', icon: AutorenewIcon, path: '/recurring' },
  { label: 'Submit Idea', icon: LightbulbOutlinedIcon, path: '/feature-request' },
];
