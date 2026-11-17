import React from 'react';
import { NavigationProp } from '@react-navigation/native';
import { AppConfig } from '../config/appConfig';

export interface TabSpec {
  /** Route name — deep links, `navigate()` calls and notification handlers key off it. */
  name: string;
  component: React.ComponentType<any>;
  /** Label shown in the tab bar; defaults to `name`. */
  label?: string;
}

export interface StackScreenSpec {
  name: string;
  component: React.ComponentType<any>;
}

export interface FloatingActionSpec {
  /** Tab route names the button floats over. */
  tabs: string[];
  accessibilityLabel: string;
  /** Called while rendering the tab bar (inside `authedProviders`), so it may use their contexts. */
  useOnPress: () => () => void;
}

export interface CoreAppProps {
  config: AppConfig;
  /** Bottom tabs, in order. The first one is initially active. */
  tabs: TabSpec[];
  renderTabIcon: (name: string, color: string) => React.ReactNode;
  /** Screens pushed above the tabs, in addition to the sign-in screens core already owns. */
  stackScreens: StackScreenSpec[];
  /** React Navigation linking config (prefixes + path → screen map). */
  linking: {
    prefixes: string[];
    config: { screens: Record<string, string> };
  };
  floatingAction?: FloatingActionSpec;
  /** Called when the user taps a push notification, whether the app was running or launched by it. */
  onNotificationResponse?: (data: Record<string, unknown> | undefined, navigation: NavigationProp<any>) => void;
  /** Wrap the signed-in tree (outermost first), inside the navigation container. */
  authedProviders?: React.ComponentType<{ children: React.ReactNode }>[];
  /** Rendered inside `authedProviders`, next to the navigator (e.g. global prompts). */
  authedOverlays?: React.ReactNode;
}
