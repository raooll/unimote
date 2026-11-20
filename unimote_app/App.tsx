import './global.css';

import { useEffect } from 'react';
import { StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastHost } from './src/components/Toast';
import { Loading } from './src/components/ui';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuth } from './src/store/auth';
import { useHydrated } from './src/store/hydration';
import { syncNow } from './src/sync/sync';

function App() {
  const ready = useHydrated();
  // Signed-in users get a quiet background sync at launch; guests are never contacted.
  useEffect(() => {
    if (ready && useAuth.getState().token) syncNow().catch(() => {});
  }, [ready]);
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="auto" />
      {ready ? (
        <View className="flex-1">
          <RootNavigator />
          <ToastHost />
        </View>
      ) : (
        <View className="flex-1 bg-slate-50 dark:bg-[#0b1020]"><Loading /></View>
      )}
    </SafeAreaProvider>
  );
}

export default App;
