import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Btn, Card, Chip, Input, Screen, Txt } from '../components/ui';
import { UnimoteIr } from '../native/UnimoteIr';
import { useAuth } from '../store/auth';
import { ThemeMode, useSettings } from '../store/settings';
import { useLibrary } from '../store/library';
import { DEFAULT_API_URL } from '../config';

export function SettingsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useSettings(s => s.theme);
  const setTheme = useSettings(s => s.setTheme);
  const apiUrl = useSettings(s => s.apiUrl);
  const setApiUrl = useSettings(s => s.setApiUrl);
  const user = useAuth(s => s.user);
  const remotes = useLibrary(s => s.remotes.length);
  const [emitter, setEmitter] = useState<boolean | null>(null);
  const [url, setUrl] = useState(apiUrl);

  useEffect(() => {
    UnimoteIr.hasIrEmitter().then(setEmitter).catch(() => setEmitter(false));
  }, []);

  const modes: { id: ThemeMode; label: string; icon: string }[] = [
    { id: 'system', label: 'System', icon: 'smartphone' },
    { id: 'dark', label: 'Dark', icon: 'moon' },
    { id: 'light', label: 'Light', icon: 'sun' },
  ];

  return (
    <Screen scroll edges={['top']}>
      <Txt variant="title" className="mb-4 mt-2">Settings</Txt>

      <Txt variant="caption" className="mb-2">Appearance</Txt>
      <View className="mb-5 flex-row">
        {modes.map(m => (
          <Chip key={m.id} label={m.label} icon={m.icon} selected={theme === m.id} onPress={() => setTheme(m.id)} />
        ))}
      </View>

      <Txt variant="caption" className="mb-2">Account</Txt>
      <Card className="mb-5 gap-1">
        <Txt variant="body" className="font-semibold">{user ? user.email : 'Using Unimote as a guest'}</Txt>
        <Txt variant="muted">
          {user
            ? 'Your rooms and remotes sync across your devices.'
            : `Everything works without an account. ${remotes} remote${remotes === 1 ? '' : 's'} stored on this phone. Signing in (optional) will back them up and sync them.`}
        </Txt>
        <View className="mt-3">
          <Btn title={user ? 'Manage account' : 'Sign in or create account'} variant="secondary" onPress={() => nav.navigate('Account')} />
        </View>
      </Card>

      <Txt variant="caption" className="mb-2">This phone</Txt>
      <Card className="mb-5 gap-1">
        <Txt variant="body" className="font-semibold">
          {emitter === null ? 'Checking…' : emitter ? 'Infrared blaster available' : 'No infrared blaster'}
        </Txt>
        <Txt variant="muted">
          {emitter === false
            ? 'IR remotes will need a Wi-Fi IR hub. Wi-Fi and Bluetooth remotes do not need IR.'
            : 'Point the top edge of your phone at the device you are controlling.'}
        </Txt>
      </Card>

      {__DEV__ && (
        <>
          <Txt variant="caption" className="mb-2">Developer</Txt>
          <Input label="API server" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          <View className="flex-row gap-2">
            <Btn title="Save" variant="secondary" onPress={() => { setApiUrl(url); setUrl(useSettings.getState().apiUrl); }} className="flex-1" />
            <Btn title="Reset" variant="ghost" onPress={() => { setApiUrl(DEFAULT_API_URL); setUrl(DEFAULT_API_URL); }} className="flex-1" />
          </View>
        </>
      )}
    </Screen>
  );
}
