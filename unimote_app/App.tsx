import './global.css';

import { StatusBar, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <View className="flex-1 items-center justify-center bg-slate-900 px-6">
        <Text className="text-4xl font-bold text-white">Unimote</Text>
        <Text className="mt-2 text-center text-base text-slate-400">
          One remote for everything.
        </Text>
      </View>
    </SafeAreaProvider>
  );
}

export default App;
