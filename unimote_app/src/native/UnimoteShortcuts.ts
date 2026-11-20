import { NativeModules, Platform } from 'react-native';
import type { Scene } from '../store/library';

interface NativeShortcuts {
  setScenes(scenes: { id: string; name: string }[]): Promise<number>;
}
const native: NativeShortcuts | undefined = Platform.OS === 'android' ? NativeModules.UnimoteShortcuts : undefined;

export const MAX_SHORTCUTS = 4;

/** Publishes the first few scenes as long-press shortcuts on the app icon. Best-effort: never throws. */
export async function publishSceneShortcuts(scenes: Pick<Scene, 'id' | 'name'>[]): Promise<void> {
  if (!native) return;
  try {
    await native.setScenes(scenes.filter(s => s.name.trim()).slice(0, MAX_SHORTCUTS).map(s => ({ id: s.id, name: s.name })));
  } catch {
    /* launchers without shortcut support */
  }
}
