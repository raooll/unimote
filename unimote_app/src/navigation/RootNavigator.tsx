import { useEffect } from 'react';
import { createNavigationContainerRef, DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useColorScheme } from 'nativewind';
import { Icon } from '../components/Icon';
import { AddBrandScreen } from '../screens/AddBrandScreen';
import { AddCategoryScreen } from '../screens/AddCategoryScreen';
import { ConnectDeviceScreen } from '../screens/ConnectDeviceScreen';
import { NearbyScreen } from '../screens/NearbyScreen';
import { LearnScreen } from '../screens/LearnScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { PanelEditScreen, PanelScreen } from '../screens/PanelScreens';
import { SceneEditScreen } from '../screens/SceneEditScreen';
import { ScenesScreen } from '../screens/ScenesScreen';
import { AddModelScreen } from '../screens/AddModelScreen';
import { RequestModelScreen } from '../screens/RequestModelScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MatchScreen } from '../screens/MatchScreen';
import { RemoteScreen } from '../screens/RemoteScreen';
import { SaveRemoteScreen } from '../screens/SaveRemoteScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { useSettings } from '../store/settings';
import { palette, useColors } from '../theme';
import type { RootStackParamList } from './types';

import { useDeepLinks } from './useDeepLinks';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();
const Tab = createBottomTabNavigator();

function Tabs() {
  const c = useColors();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
      }}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: ({ color }) => <Icon name="layout-grid" size={22} color={color} /> }} />
      <Tab.Screen name="Scenes" component={ScenesScreen} options={{ tabBarIcon: ({ color }) => <Icon name="clapperboard" size={22} color={color} /> }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: ({ color }) => <Icon name="settings" size={22} color={color} /> }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  useDeepLinks(navigationRef);
  const mode = useSettings(s => s.theme);
  const { colorScheme, setColorScheme } = useColorScheme();
  useEffect(() => {
    try {
      setColorScheme(mode);
    } catch (e) {
      // Throws when Tailwind `darkMode: 'class'` was not applied (e.g. unit tests without Metro).
      const inJest = !!(globalThis as { process?: { env?: Record<string, string> } }).process?.env?.JEST_WORKER_ID;
      if (__DEV__ && !inJest) console.warn('Could not set colour scheme', e);
    }
  }, [mode, setColorScheme]);

  const p = colorScheme === 'light' ? palette.light : palette.dark;
  const base = colorScheme === 'light' ? DefaultTheme : DarkTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, background: p.bg, card: p.card, text: p.text, border: p.border, primary: p.accent },
  };

  return (
    <NavigationContainer ref={navigationRef} theme={theme}>
      <Stack.Navigator screenOptions={{ headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="AddCategory" component={AddCategoryScreen} options={{ title: 'Add a remote' }} />
        <Stack.Screen name="AddBrand" component={AddBrandScreen} options={{ title: 'Brand' }} />
        <Stack.Screen name="AddModel" component={AddModelScreen} options={{ title: 'Model' }} />
        <Stack.Screen name="RequestModel" component={RequestModelScreen} options={{ title: 'Request a device' }} />
        <Stack.Screen name="Match" component={MatchScreen} options={{ title: 'Find the right remote' }} />
        <Stack.Screen name="SaveRemote" component={SaveRemoteScreen} options={{ title: 'Save remote' }} />
        <Stack.Screen name="Remote" component={RemoteScreen} />
        <Stack.Screen name="Learn" component={LearnScreen} options={{ title: 'Record a remote' }} />
        <Stack.Screen name="Account" component={AccountScreen} options={{ title: 'Account' }} />
        <Stack.Screen name="SceneEdit" component={SceneEditScreen} options={{ title: 'Scene' }} />
        <Stack.Screen name="Panel" component={PanelScreen} />
        <Stack.Screen name="PanelEdit" component={PanelEditScreen} options={{ title: 'Custom remote' }} />
        <Stack.Screen name="ConnectDevice" component={ConnectDeviceScreen} options={{ title: 'Connect device' }} />
        <Stack.Screen name="Nearby" component={NearbyScreen} options={{ title: 'Add a remote' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
