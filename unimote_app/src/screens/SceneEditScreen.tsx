import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActionPicker } from '../components/ActionPicker';
import { Icon } from '../components/Icon';
import { Btn, Card, Chip, Input, Screen, Txt } from '../components/ui';
import { prettify } from '../lib/commands';
import type { RootStackParamList } from '../navigation/types';
import { SceneStep, useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { useColors } from '../theme';
import { confirmDelete } from './ScenesScreen';

const DELAYS = [0, 1000, 3000, 5000, 10000];

export function SceneEditScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { id } = useRoute<NativeStackScreenProps<RootStackParamList, 'SceneEdit'>['route']>().params;
  const c = useColors();
  const existing = useLibrary(s => s.scenes.find(x => x.id === id));
  const remotes = useLibrary(s => s.remotes);
  const upsert = useLibrary(s => s.upsertScene);
  const remove = useLibrary(s => s.removeScene);
  const toast = useUi(s => s.show);
  const [name, setName] = useState(existing?.name ?? '');
  const [steps, setSteps] = useState<SceneStep[]>(existing?.steps ?? []);
  const [picking, setPicking] = useState(false);

  const patch = (i: number, p: Partial<SceneStep>) => setSteps(list => list.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const move = (i: number, d: -1 | 1) =>
    setSteps(list => {
      const j = i + d;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = () => {
    if (!name.trim()) return toast('Give the scene a name', 'error');
    if (steps.length === 0) return toast('Add at least one step', 'error');
    upsert({ id: existing?.id, name, steps });
    nav.goBack();
  };

  return (
    <Screen scroll>
      <Input label="Scene name" value={name} onChangeText={setName} placeholder="Movie night" />
      <Txt variant="caption" className="mb-2">Steps run in order</Txt>
      {steps.map((s, i) => {
        const r = remotes.find(x => x.id === s.remote);
        return (
          <Card key={i} className="mb-2">
            <View className="flex-row items-center gap-2">
              <View className="flex-1">
                <Txt numberOfLines={1}>{i + 1}. {r?.name ?? 'Removed remote'}: {prettify(s.command)}</Txt>
              </View>
              <Pressable onPress={() => move(i, -1)} hitSlop={8} accessibilityLabel="Move up"><Icon name="chevron-up" size={20} color={c.muted} /></Pressable>
              <Pressable onPress={() => move(i, 1)} hitSlop={8} accessibilityLabel="Move down"><Icon name="chevron-down" size={20} color={c.muted} /></Pressable>
              <Pressable onPress={() => setSteps(list => list.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel="Remove step"><Icon name="trash-2" size={20} color="#ef4444" /></Pressable>
            </View>
            <Txt variant="caption" className="mb-1 mt-3">Wait after this step</Txt>
            <View className="flex-row flex-wrap">
              {DELAYS.map(d => (
                <Chip key={d} label={d === 0 ? 'None' : `${d / 1000}s`} selected={(s.delayMs ?? 0) === d} onPress={() => patch(i, { delayMs: d || undefined })} />
              ))}
            </View>
          </Card>
        );
      })}
      <Btn title="Add step" icon="plus" variant="secondary" onPress={() => setPicking(true)} />
      <View className="mt-6 gap-2">
        <Btn title="Save scene" onPress={save} />
        {existing && <Btn title="Delete scene" variant="danger" icon="trash-2" onPress={() => confirmDelete(existing.name, () => { remove(existing.id); nav.goBack(); })} />}
      </View>
      <ActionPicker visible={picking} onClose={() => setPicking(false)} onPick={a => setSteps(list => [...list, { remote: a.remote, command: a.command }])} />
    </Screen>
  );
}
