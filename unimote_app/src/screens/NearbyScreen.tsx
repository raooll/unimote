import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import type { Remote } from '../api/types';
import { useCodePrompt } from '../components/CodePrompt';
import { Icon } from '../components/Icon';
import { Btn, Card, Screen, Txt } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { pairDevice } from '../transport/dispatcher';
import { scanBluetooth, scanNetwork, type BluetoothScan, type NearbyDevice, type NearbyScan } from '../transport/nearby';

/**
 * "Add a remote", step one: look for devices that can be controlled right now (Wi-Fi, then Bluetooth), the way
 * Mi Remote does. Anything that is not found falls through to the device-type list (infrared codes).
 */
export function NearbyScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const saveRemote = useLibrary(s => s.saveRemote);
  const updateRemote = useLibrary(s => s.updateRemote);
  const toast = useUi(s => s.show);
  const { ask, element: codePrompt } = useCodePrompt();
  const [wifi, setWifi] = useState<NearbyScan | null>(null);
  const [bt, setBt] = useState<BluetoothScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const run = useCallback(async () => {
    setScanning(true);
    setMessage(null);
    setWifi(null);
    setBt(null);
    // Each section appears as soon as its own search finishes.
    await Promise.all([scanNetwork().then(setWifi), scanBluetooth().then(setBt)]);
    setScanning(false);
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const finish = (remote: Remote, name: string, settings: Record<string, unknown>) => {
    const saved = saveRemote(remote, name, null);
    updateRemote(saved.id, { settings });
    toast(`Connected to ${name}`, 'info');
    nav.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'Remote', params: { id: saved.id } }] });
  };

  /** Find the catalog profile, pair with the device, save the remote, open it. */
  const addDevice = async (key: string, address: string, name: string, query: { category: string; brand?: string; protocol: string }) => {
    setBusy(key);
    setMessage('Connecting… if your TV shows a prompt or a code, follow it.');
    try {
      const profile = (await api.match(query))[0];
      if (!profile) throw new Error('No remote profile for this device in the catalog yet.');
      const remote = await api.remote(profile.id);
      const res = await pairDevice(remote, address, { settings: {} }, ask);
      if (!res.ok) return setMessage(res.message);
      finish(remote, name, res.settings);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not add this device.');
    } finally {
      setBusy(null);
    }
  };

  const wifiDevices = wifi?.devices ?? [];
  const hubs = wifi?.hubs ?? [];
  const btDevices = bt?.devices ?? [];

  return (
    <Screen scroll>
      {codePrompt}
      <Txt variant="heading" className="mb-1">Find your device</Txt>
      <Txt variant="muted" className="mb-4">Turn the device on. Your phone must be on the same Wi-Fi, and Bluetooth devices must be paired in Android Settings first.</Txt>

      <Txt variant="caption" className="mb-2">On your Wi-Fi</Txt>
      {wifiDevices.length === 0 && (
        <Card className="mb-3"><Txt variant="muted">{wifi ? 'No Roku, Samsung, LG or Android TV answered.' : 'Searching…'}</Txt></Card>
      )}
      {wifiDevices.map(d => (
        <DeviceRow key={`${d.kind}:${d.ip}`} icon="tv" title={d.name} subtitle={[d.detail, d.ip].filter(Boolean).join(' · ')}
          busy={busy === d.ip} disabled={!!busy} onPress={() => addDevice(d.ip, d.ip, d.name, { category: d.category, brand: d.brand, protocol: 'wifi' })} />
      ))}
      {hubs.map(h => (
        <Card key={h.mac} className="mb-2 gap-1">
          <Txt>IR hub {h.host}</Txt>
          <Txt variant="muted">Sends infrared for you. Add an infrared remote below, then choose this hub on its Connect screen.</Txt>
        </Card>
      ))}

      <Txt variant="caption" className="mb-2 mt-4">Bluetooth (paired)</Txt>
      {btDevices.length === 0 && (
        <Card className="mb-3">
          <Txt variant="muted">
            {!bt ? 'Searching…' : bt.denied ? 'Bluetooth permission is off. Allow it in Settings to list paired devices.' : 'No paired Bluetooth devices. Pair your TV or box in Android Settings, then search again.'}
          </Txt>
        </Card>
      )}
      {btDevices.map(d => (
        <DeviceRow key={d.address} icon="bluetooth" title={d.name || 'Bluetooth device'} subtitle="Use your phone as its Bluetooth remote"
          busy={busy === d.address} disabled={!!busy} onPress={() => addDevice(d.address, d.address, d.name || 'Bluetooth device', { category: 'tv', brand: 'generic', protocol: 'bluetooth_hid' })} />
      ))}

      <View className="mt-3 gap-2">
        <Btn title={scanning ? 'Searching…' : 'Search again'} variant="ghost" icon="refresh-cw" onPress={run} disabled={scanning || !!busy} />
        <Txt variant="caption" className="mt-3">Not listed?</Txt>
        <Btn title="Choose by device type" icon="remote" onPress={() => nav.navigate('AddCategory')} disabled={!!busy} />
        <Btn title="Record your remote" icon="radio" variant="ghost" onPress={() => nav.navigate('Learn')} disabled={!!busy} />
      </View>
      {message && <Txt variant="muted" className="mt-3">{message}</Txt>}
    </Screen>
  );
}

function DeviceRow({ icon, title, subtitle, busy, disabled, onPress }: { icon: string; title: string; subtitle?: string; busy: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Card className="mb-2 flex-row items-center gap-3">
      <Icon name={icon} size={22} color="#6366f1" />
      <View className="flex-1">
        <Txt>{title}</Txt>
        {subtitle ? <Txt variant="muted" numberOfLines={1}>{subtitle}</Txt> : null}
      </View>
      <Btn title={busy ? 'Connecting…' : 'Add'} onPress={onPress} disabled={disabled} />
    </Card>
  );
}
