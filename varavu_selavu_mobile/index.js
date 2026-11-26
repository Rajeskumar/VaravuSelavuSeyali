import { registerRootComponent } from 'expo';

// Before App: sanitize errors thrown during module initialisation (see src/app/fatalGuard.ts).
import './src/app/fatalGuard';

import App from './src/app/App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
