import { useLayoutEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActionPicker } from '../components/ActionPicker';
import { Icon } from '../components/Icon';
import { KeyButton } from '../components/remote/KeyButton';
import { Btn, Card, Input, Screen, Txt } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';
import { PanelButton, useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { useColors } from '../theme';
import { sendCommand } from '../transport/dispatcher';
import { confirmDelete } from './ScenesScreen';

/** A custom remote that mixes buttons from several devices. */
export function PanelScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { id } = useRoute<NativeStackScreenProps<RootStackParamList, 'Panel'>['route']>().params;
  const c = useColors();
  const panel = useLibrary(s => s.panels.find(p => p.id === id));
  const toast = useUi(s => s.show);

  useLayoutEffect(() => {
    nav.setOptions({
      title: panel?.name ?? 'Custom remote',
      headerRight: () => (
        <Pressable onPress={() => nav.navigate('PanelEdit', { id })} hitSlop={12} accessibilityRole="button" accessibilityLabel="Edit custom remote">
          <Icon name="pencil" size={22} color={c.text} />
        </Pressable>
      ),
    });
  }, [nav, panel?.name, id, c.text]);

  if (!panel) return <Screen><Txt>Not found.</Txt></Screen>;

  const press = async (b: PanelButton) => {
    const { remotes, catalog, updateRemote } = useLibrary.getState();
    const saved = remotes.find(r => r.id === b.remote);
    const remote = saved ? catalog[saved.remoteId] : undefined;
    if (!saved || !remote) return toast('That remote is no longer on your phone.', 'error');
    const res = await sendCommand(remote, b.command, {
      settings: saved.settings,
      updateSettings: patch => updateRemote(saved.id, { settings: { ...(useLibrary.getState().remotes.find(r => r.id === saved.id)?.settings ?? {}), ...patch } }),
    });
    if (!res.ok) toast(res.message, 'error');
  };

  return (
    <Screen scroll>
      {panel.buttons.length === 0 ? (
        <Txt variant="muted" className="mt-6 text-center">No buttons yet. Tap the pencil to add some.</Txt>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {panel.buttons.map((b, i) => (
            <View key={i} className="w-[31%]">
              <KeyButton button={{ key: b.command }} label={b.label} onPress={() => press(b)} size="sm" />
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

export function PanelEditScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { id } = useRoute<NativeStackScreenProps<RootStackParamList, 'PanelEdit'>['route']>().params;
  const c = useColors();
  const existing = useLibrary(s => s.panels.find(p => p.id === id));
  const remotes = useLibrary(s => s.remotes);
  const upsert = useLibrary(s => s.upsertPanel);
  const remove = useLibrary(s => s.removePanel);
  const toast = useUi(s => s.show);
  const [name, setName] = useState(existing?.name ?? '');
  const [buttons, setButtons] = useState<PanelButton[]>(existing?.buttons ?? []);
  const [picking, setPicking] = useState(false);

  const save = () => {
    if (!name.trim()) return toast('Give it a name', 'error');
    if (buttons.length === 0) return toast('Add at least one button', 'error');
    upsert({ id: existing?.id, name, buttons });
    nav.goBack();
  };

  return (
    <Screen scroll>
      <Input label="Name" value={name} onChangeText={setName} placeholder="Living room essentials" />
      <Txt variant="caption" className="mb-2">Buttons</Txt>
      {buttons.map((b, i) => (
        <Card key={i} className="mb-2 flex-row items-center gap-3">
          <View className="flex-1">
            <Txt numberOfLines={1}>{b.label}</Txt>
            <Txt variant="muted" numberOfLines={1}>{remotes.find(r => r.id === b.remote)?.name ?? 'Removed remote'}</Txt>
          </View>
          <Pressable onPress={() => setButtons(l => l.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel="Remove button"><Icon name="trash-2" size={20} color="#ef4444" /></Pressable>
        </Card>
      ))}
      <Btn title="Add button" icon="plus" variant="secondary" onPress={() => setPicking(true)} />
      <View className="mt-6 gap-2">
        <Btn title="Save" onPress={save} />
        {existing && <Btn title="Delete" variant="danger" icon="trash-2" onPress={() => confirmDelete(existing.name, () => { remove(existing.id); nav.popToTop(); })} />}
      </View>
      <ActionPicker visible={picking} onClose={() => setPicking(false)} onPick={a => setButtons(l => [...l, a])} />
    </Screen>
  );
}
