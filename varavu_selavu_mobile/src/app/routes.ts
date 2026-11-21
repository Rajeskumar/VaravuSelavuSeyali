import { StackScreenSpec } from '../core/navigation/types';
import ActivityScreen from '../features/activity/screens/ActivityScreen';
import ProfileScreen from '../features/account/screens/ProfileScreen';
import RecurringExpensesScreen from '../features/recurring/screens/RecurringExpensesScreen';
import ItemDetailScreen from '../features/expenses/screens/ItemDetailScreen';
import MerchantDetailScreen from '../features/expenses/screens/MerchantDetailScreen';
import CardsScreen from '../features/cards/screens/CardsScreen';
import TagsScreen from '../features/tags/screens/TagsScreen';
import AboutScreen from '../features/account/screens/AboutScreen';
import FeedbackScreen from '../features/account/screens/FeedbackScreen';
import GroupsScreen from '../features/groups/screens/GroupsScreen';
import GroupDetailScreen from '../features/groups/screens/GroupDetailScreen';
import JoinGroupScreen from '../features/groups/screens/JoinGroupScreen';

// Pushed above the tabs. Security and DeleteAccount are core screens and registered by core.
export const stackScreens: StackScreenSpec[] = [
  { name: 'Activity', component: ActivityScreen },
  { name: 'Profile', component: ProfileScreen },
  { name: 'Recurring', component: RecurringExpensesScreen },
  { name: 'ItemDetail', component: ItemDetailScreen },
  { name: 'MerchantDetail', component: MerchantDetailScreen },
  { name: 'Cards', component: CardsScreen },
  { name: 'Tags', component: TagsScreen },
  { name: 'About', component: AboutScreen },
  { name: 'Feedback', component: FeedbackScreen },
  // ── Groups (TS-GRP-109) ──
  { name: 'Groups', component: GroupsScreen },
  { name: 'GroupDetail', component: GroupDetailScreen },
  { name: 'JoinGroup', component: JoinGroupScreen },
];
