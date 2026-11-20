/**
 * @format
 */

import { AppRegistry, LogBox } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// Dev-only: a third-party library still uses ImageBackground; nothing in this app can fix that warning.
LogBox.ignoreLogs(['ImageBackground is deprecated']);

AppRegistry.registerComponent(appName, () => App);
