import React, { useContext } from 'react';
import CoreApp from '../core/navigation/CoreApp';
import { FloatingActionSpec } from '../core/navigation/types';
import { trackSpenseConfig } from './appConfig';
import { registerFeatures } from './registrations';
import { setupAnalytics } from './analytics';
import { tabs, renderTabIcon, FAB_TABS } from './tabs';
import { stackScreens } from './routes';
import { linking } from './linking';
import AddExpenseProvider, { AddExpenseContext } from '../features/expenses/screens/AddExpenseScreen';
import RecurringPrompt from '../features/recurring/components/RecurringPrompt';
import { onNotificationResponse } from './notificationResponse';

registerFeatures();
setupAnalytics();

const floatingAction: FloatingActionSpec = {
  tabs: FAB_TABS,
  accessibilityLabel: 'Add expense',
  useOnPress: () => useContext(AddExpenseContext).openAddExpense,
};

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
