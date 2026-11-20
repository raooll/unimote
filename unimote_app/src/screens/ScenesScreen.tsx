import { useRef, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Icon } from '../components/Icon';
import { Btn, Card, EmptyState, Screen, Txt } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';
import { runSavedScene } from '../scenes/run';
import { useLibrary } from '../store/library';
import type { Scene } from '../store/library';
import { useUi } from '../store/ui';
import { useColors } from '../theme';

/** Runs a scene and reports the outcome with a toast; only one scene runs at a time. */
export function useSceneRunner() {
  const toast = useUi(s => s.show);
  const [running, setRunning] = useState<string | null>(null);
  const busy = useRef(false);
  const run = async (scene: Scene) => {
    if (busy.current) return;
    busy.current = true;
    setRunning(scene.id);
    try {
      const { message, ok } = await runSavedScene(scene);
      toast(message, ok ? 'info' : 'error');
    } finally {
      busy.current = false;
      setRunning(null);
    }
  };
  return { run, running };
}

export function ScenesScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const c = useColors();
  const scenes = useLibrary(s => s.scenes);
  const panels = useLibrary(s => s.panels);
  const hasRemotes = useLibrary(s => s.remotes.length > 0);
  const { run, running } = useSceneRunner();

  const confirmRun = (scene: Scene) => {
    if (scene.steps.length === 0) return nav.navigate('SceneEdit', { id: scene.id });
    run(scene);
  };

  return (
    <Screen edges={['top']}>
      <View className="pb-3 pt-2">
        <Txt variant="title">Scenes</Txt>
        <Txt variant="muted">One tap for several actions, plus your own mixed remotes</Txt>
      </View>

      {!hasRemotes ? (
        <EmptyState icon="clapperboard" title="Add a remote first" message="Scenes combine buttons from your remotes, for example “Movie night”." />
      ) : (
        <FlatList
          data={scenes}
          keyExtractor={s => s.id}
          contentContainerClassName="gap-3 pb-10"
          ListHeaderComponent={
            panels.length ? (
              <View className="mb-3">
                <Txt variant="caption" className="mb-2">Custom remotes</Txt>
                {panels.map(p => (
                  <Pressable key={p.id} onPress={() => nav.navigate('Panel', { id: p.id })} accessibilityRole="button" accessibilityLabel={p.name}>
                    <Card className="mb-2 flex-row items-center gap-3">
                      <Icon name="layout-grid" size={22} color={c.accent} />
                      <View className="flex-1"><Txt>{p.name}</Txt><Txt variant="muted">{p.buttons.length} buttons</Txt></View>
                      <Icon name="chevron-right" size={20} color={c.muted} />
                    </Card>
                  </Pressable>
                ))}
              </View>
            ) : undefined
          }
          renderItem={({ item }) => (
            <Card className="flex-row items-center gap-3">
              <Pressable className="flex-1 flex-row items-center gap-3" onPress={() => confirmRun(item)} accessibilityRole="button" accessibilityLabel={`Run ${item.name}`}>
                <View className="h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-500/15">
                  <Icon name={running === item.id ? 'loader' : 'play'} size={22} color={c.accent} />
                </View>
                <View className="flex-1">
                  <Txt variant="heading" numberOfLines={1}>{item.name}</Txt>
                  <Txt variant="muted">{item.steps.length} step{item.steps.length === 1 ? '' : 's'}</Txt>
                </View>
              </Pressable>
              <Pressable onPress={() => nav.navigate('SceneEdit', { id: item.id })} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`}>
                <Icon name="pencil" size={20} color={c.muted} />
              </Pressable>
            </Card>
          )}
          ListEmptyComponent={<Txt variant="muted" className="mt-4 text-center">No scenes yet.</Txt>}
          ListFooterComponent={
            <View className="mt-4 gap-2">
              <Btn title="New scene" icon="plus" onPress={() => nav.navigate('SceneEdit', {})} />
              <Btn title="New custom remote" icon="layout-grid" variant="secondary" onPress={() => nav.navigate('PanelEdit', {})} />
            </View>
          }
        />
      )}
    </Screen>
  );
}

export function confirmDelete(title: string, onConfirm: () => void) {
  Alert.alert(`Delete “${title}”?`, 'This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}
