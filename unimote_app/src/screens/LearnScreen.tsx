import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { Icon } from '../components/Icon';
import { Btn, Card, Chip, Input, Screen, Txt } from '../components/ui';
import { prettify } from '../lib/commands';
import { buildRecordedRemote, buildSubmission, RECORDABLE_BUTTONS } from '../learn/recorded';
import type { RootStackParamList } from '../navigation/types';
import { HubDevice, UnimoteHub } from '../native/UnimoteHub';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { useColors } from '../theme';

/** Record a remote that is not in the catalog: an IR hub listens while the user presses their original remote. */
export function LearnScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const c = useColors();
  const toast = useUi(s => s.show);
  const saveRemote = useLibrary(s => s.saveRemote);
  const [hubs, setHubs] = useState<HubDevice[]>([]);
  const [hub, setHub] = useState<HubDevice | null>(null);
  const [scanning, setScanning] = useState(false);
  const [categories, setCategories] = useState<{ slug: string; name: string }[]>([]);
  const [category, setCategory] = useState('tv');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [signals, setSignals] = useState<Record<string, number[]>>({});
  const [listening, setListening] = useState<string | null>(null);
  const [share, setShare] = useState(true);

  const scan = async () => {
    setScanning(true);
    try {
      const found = await UnimoteHub.discover();
      setHubs(found);
      if (found.length === 1) setHub(found[0]);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    scan();
    api.categories().then(list => setCategories(list.map(x => ({ slug: x.slug, name: x.name })))).catch(() => {});
  }, []);

  const record = async (key: string) => {
    if (!hub || listening) return;
    setListening(key);
    try {
      const pattern = await UnimoteHub.learnIr(hub);
      setSignals(s => ({ ...s, [key]: pattern }));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not record that button', 'error');
    } finally {
      setListening(null);
    }
  };

  const count = Object.keys(signals).length;
  const canSave = !!hub && brand.trim() && count > 0 && !listening;

  const save = async () => {
    const input = { brand, model, category, signals };
    const saved = saveRemote(buildRecordedRemote(input), `${brand.trim()} ${model.trim()}`.trim(), null);
    // The hub that recorded the signals is the one that can replay them without an IR blaster in the phone.
    useLibrary.getState().updateRemote(saved.id, { settings: { hub } });
    if (share) {
      try {
        await api.submitRemote(buildSubmission(input));
        toast('Saved. Thanks for sharing it with the community!');
      } catch {
        toast('Saved on your phone. Sharing it did not work this time.', 'error');
      }
    }
    nav.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'Remote', params: { id: saved.id } }] });
  };

  return (
    <Screen scroll>
      <Txt variant="muted" className="mb-4">
        Can’t find your remote? Record it. A Wi-Fi IR hub (Broadlink RM) listens while you press the buttons on your original remote.
      </Txt>

      <Txt variant="caption" className="mb-2">1. IR hub</Txt>
      {hubs.length === 0 && <Card className="mb-2"><Txt variant="muted">{scanning ? 'Searching your network…' : 'No hub found. Plug it in, connect it to the same Wi-Fi, then search again.'}</Txt></Card>}
      {hubs.map(h => (
        <Card key={h.mac} className="mb-2 flex-row items-center gap-3">
          <Icon name="radio" size={20} color={c.accent} />
          <View className="flex-1"><Txt>IR hub {h.host}</Txt><Txt variant="muted">{h.mac}</Txt></View>
          <Btn title={hub?.mac === h.mac ? 'Selected' : 'Use'} variant={hub?.mac === h.mac ? 'secondary' : 'primary'} onPress={() => setHub(h)} />
        </Card>
      ))}
      <Btn title={scanning ? 'Searching…' : 'Search again'} variant="ghost" icon="refresh-cw" onPress={scan} disabled={scanning} />

      <Txt variant="caption" className="mb-2 mt-4">2. About the device</Txt>
      <View className="mb-2 flex-row flex-wrap">
        {categories.map(x => <Chip key={x.slug} label={x.name} selected={category === x.slug} onPress={() => setCategory(x.slug)} />)}
      </View>
      <Input label="Brand" value={brand} onChangeText={setBrand} placeholder="Samsung" autoCapitalize="words" />
      <Input label="Model (optional)" value={model} onChangeText={setModel} placeholder="UE55AU7100" autoCapitalize="characters" />

      <Txt variant="caption" className="mb-2">3. Record buttons ({count} recorded)</Txt>
      <Txt variant="muted" className="mb-2">Tap a button here, then within 15 seconds press the same button on your original remote, pointing it at the hub.</Txt>
      <View className="flex-row flex-wrap">
        {RECORDABLE_BUTTONS.map(k => (
          <Chip key={k} label={listening === k ? 'Listening…' : prettify(k)} icon={signals[k] ? 'check' : undefined} selected={!!signals[k]} onPress={() => record(k)} />
        ))}
      </View>

      <View className="mt-4">
        <Chip label={share ? 'Share with the community: on' : 'Share with the community: off'} icon={share ? 'heart' : undefined} selected={share} onPress={() => setShare(v => !v)} />
        <Txt variant="muted" className="mt-1">Shared remotes are reviewed before they help other people. Only the brand, model and button signals are sent.</Txt>
      </View>
      <View className="mt-4"><Btn title="Save remote" onPress={save} disabled={!canSave} /></View>
    </Screen>
  );
}
