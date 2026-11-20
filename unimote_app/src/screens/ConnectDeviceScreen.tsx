import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCodePrompt } from '../components/CodePrompt';
import { Icon } from '../components/Icon';
import { Btn, Card, Input, Screen, Txt } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { findDevices, FoundDevice, pairDevice } from '../transport/dispatcher';

const HELP = {
  wifi: 'Your phone and the device must be on the same Wi-Fi network.',
  ble: 'Power the light on and keep it close to your phone.',
  bluetooth_hid: 'First pair the device in Android Settings → Bluetooth, then pick it here. Your phone will act as its remote.',
  ir: 'Pick a Wi-Fi IR hub (Broadlink RM) on your network. Your phone will send this remote’s buttons through it.',
} as const;

/** One-time "connect to your device" step for Wi-Fi remotes: find it on the network (or type its IP) and pair. */
export function ConnectDeviceScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { id } = useRoute<NativeStackScreenProps<RootStackParamList, 'ConnectDevice'>['route']>().params;
  const saved = useLibrary(s => s.remotes.find(r => r.id === id));
  const remote = useLibrary(s => (saved ? s.catalog[saved.remoteId] : undefined));
  const update = useLibrary(s => s.updateRemote);
  const toast = useUi(s => s.show);
  const { ask, element: codePrompt } = useCodePrompt();
  const [found, setFound] = useState<FoundDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [host, setHost] = useState(typeof saved?.settings.host === 'string' ? saved.settings.host : '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const scan = useCallback(async () => {
    if (!remote) return;
    setScanning(true);
    try {
      setFound(await findDevices(remote));
    } catch (e) {
      setFound([]);
      setMessage(e instanceof Error ? e.message : null);
    } finally {
      setScanning(false);
    }
  }, [remote]);

  useEffect(() => {
    scan();
  }, [scan]);

  if (!saved || !remote) return <Screen><Txt>Remote not found.</Txt></Screen>;

  const connect = async (address: string) => {
    if (!address.trim()) return;
    setBusy(true);
    setMessage('Connecting… if your TV shows a prompt, choose Allow.');
    const current = useLibrary.getState().remotes.find(r => r.id === id)?.settings ?? {};
    const res = await pairDevice(remote, address, { settings: current }, ask);
    setBusy(false);
    if (res.ok) {
      update(id, { settings: { ...current, ...res.settings } });
      toast(res.name ? `Connected to ${res.name}` : 'Connected', 'info');
      nav.goBack();
    } else {
      setMessage(res.message);
    }
  };

  return (
    <Screen scroll>
      {codePrompt}
      <Txt variant="heading" className="mb-1">Connect to your {saved.name}</Txt>
      <Txt variant="muted" className="mb-4">{HELP[remote.protocol]}</Txt>

      <Txt variant="caption" className="mb-2">Found on your network</Txt>
      {found.length === 0 && (
        <Card className="mb-3"><Txt variant="muted">{scanning ? 'Searching…' : 'Nothing found.'}</Txt></Card>
      )}
      {found.map(d => (
        <Card key={d.id} className="mb-2 flex-row items-center gap-3">
          <Icon name="tv" size={22} color="#6366f1" />
          <View className="flex-1">
            <Txt>{d.label}</Txt>
            {d.detail ? <Txt variant="muted" numberOfLines={1}>{d.detail}</Txt> : null}
          </View>
          <Btn title="Connect" onPress={() => connect(d.id)} disabled={busy} />
        </Card>
      ))}
      <Btn title={scanning ? 'Searching…' : 'Search again'} variant="ghost" icon="refresh-cw" onPress={scan} disabled={scanning || busy} />

      {remote.protocol === 'wifi' && (
        <>
          <Txt variant="caption" className="mb-2 mt-6">Or enter the IP address</Txt>
          <Input label="IP address" value={host} onChangeText={setHost} placeholder="192.168.1.20" keyboardType="numbers-and-punctuation" autoCapitalize="none" />
          <View className="mt-3"><Btn title={busy ? 'Connecting…' : 'Connect'} onPress={() => connect(host)} disabled={busy || !host.trim()} /></View>
        </>
      )}
      {message && <Txt variant="muted" className="mt-3">{message}</Txt>}
    </Screen>
  );
}
