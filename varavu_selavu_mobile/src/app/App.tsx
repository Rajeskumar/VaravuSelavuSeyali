import React, { useContext } from 'react';
import CoreApp from '../core/navigation/CoreApp';
import { FloatingActionSpec } from '../core/navigation/types';
import { trackSpenseConfig } from './appConfig';
import { registerFeatures } from './registrations';
import { tabs, renderTabIcon, FAB_TABS } from './tabs';
import { stackScreens } from './routes';
import { linking } from './linking';
import AddExpenseProvider, { AddExpenseContext } from '../features/expenses/screens/AddExpenseScreen';
import RecurringPrompt from '../features/recurring/components/RecurringPrompt';
import { extractGroupIdFromNotificationData } from '../features/groups/utils/notificationLink';

registerFeatures();

const floatingAction: FloatingActionSpec = {
  tabs: FAB_TABS,
  accessibilityLabel: 'Add expense',
  useOnPress: () => useContext(AddExpenseContext).openAddExpense,
};

// Tapping a push notification (TS-GRP-110) deep-links straight to the group it's about.
function onNotificationResponse(data: Record<string, unknown> | undefined, navigation: { navigate: (...args: any[]) => void }) {
  const groupId = extractGroupIdFromNotificationData(data);
  if (groupId) navigation.navigate('GroupDetail', { groupId });
}

const authedOverlays = <RecurringPrompt />;

export default function App() {
  return (
    <CoreApp
      config={trackSpenseConfig}
      tabs={tabs}
      renderTabIcon={renderTabIcon}
      stackScreens={stackScreens}
      linking={linking}
      floatingAction={floatingAction}
      onNotificationResponse={onNotificationResponse}
      authedProviders={[AddExpenseProvider]}
      authedOverlays={authedOverlays}
    />
  );
}
