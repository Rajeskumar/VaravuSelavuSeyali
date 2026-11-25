import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

jest.mock('react-native-screens', () => ({ ...jest.requireActual('react-native-screens'), enableScreens: jest.fn() }));

import { configureAnalytics, analytics } from './index';
import { createRecordingProvider } from './providers/recording';
import { createScreenTracker } from './screenTracker';

const events = { screen_view: { feature: 'navigation', properties: { screen_name: { values: ['home', 'detail', 'tab_a', 'tab_b'] } } } };
const screens = { Home: 'home', Detail: 'detail', TabA: 'tab_a', TabB: 'tab_b' };
const Stack = createNativeStackNavigator();
const Inner = createNativeStackNavigator();
const Home = () => <Text>home</Text>;
const Detail = () => <Text>detail</Text>;
function Tabs() {
  // MainTabs is a container: only its focused leaf (TabA/TabB) may be reported.
  return (
    <Inner.Navigator>
      <Inner.Screen name="TabA" component={Home} />
      <Inner.Screen name="TabB" component={Detail} />
    </Inner.Navigator>
  );
}

function harness() {
  const provider = createRecordingProvider();
  configureAnalytics({ provider, events, platform: 'ios', product: 'demo' });
  analytics.setConsent(true);
  const ref = createNavigationContainerRef<any>();
  const tracker = createScreenTracker(screens, (id) => { analytics.trackScreen(id); });
  render(
    <NavigationContainer ref={ref}
      onReady={() => tracker.onReady(ref.getCurrentRoute()?.name)}
      onStateChange={() => tracker.onStateChange(ref.getCurrentRoute()?.name)}>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={Home} />
        <Stack.Screen name="Detail" component={Detail} />
        <Stack.Screen name="MainTabs" component={Tabs} />
      </Stack.Navigator>
    </NavigationContainer>,
  );
  const screensSeen = () => provider.calls.filter((c) => c.type === 'screen').map((c) => (c as { name: string }).name);
  return { ref, screensSeen, provider };
}

test('one event per navigation, none for params-only changes, nested leaf only', async () => {
  const { ref, screensSeen } = harness();
  await act(async () => {});
  expect(screensSeen()).toEqual(['home']);

  await act(async () => { ref.navigate('Detail', { groupId: 'SECRET-UUID', merchant: 'Joe\'s Pizza' }); });
  await act(async () => { ref.setParams({ merchant: 'Other' }); });
  expect(screensSeen()).toEqual(['home', 'detail']);

  await act(async () => { ref.navigate('MainTabs', { screen: 'TabA' }); });
  expect(screensSeen()).toEqual(['home', 'detail', 'tab_a']);
  await act(async () => { ref.navigate('MainTabs', { screen: 'TabB' }); });
  await act(async () => { ref.goBack(); });
  expect(screensSeen().at(-1)).toBe('tab_a');
});

test('nothing about params, titles or the stack ever reaches the provider', async () => {
  const { ref, provider } = harness();
  await act(async () => {});
  await act(async () => { ref.navigate('Detail', { groupId: 'SECRET-UUID', token: 'invite-token', merchant: 'Joe\'s Pizza' }); });
  expect(JSON.stringify(provider.calls)).not.toMatch(/SECRET|token|Joe|MainTabs/);
});

test('without consent, navigating sends nothing', async () => {
  const provider = createRecordingProvider();
  configureAnalytics({ provider, events, platform: 'ios', product: 'demo' });
  const ref = createNavigationContainerRef<any>();
  const tracker = createScreenTracker(screens, (id) => { analytics.trackScreen(id); });
  render(
    <NavigationContainer ref={ref} onReady={() => tracker.onReady(ref.getCurrentRoute()?.name)}
      onStateChange={() => tracker.onStateChange(ref.getCurrentRoute()?.name)}>
      <Stack.Navigator><Stack.Screen name="Home" component={Home} /><Stack.Screen name="Detail" component={Detail} /></Stack.Navigator>
    </NavigationContainer>,
  );
  await act(async () => { ref.navigate('Detail'); });
  expect(provider.calls).toEqual([]);
});
