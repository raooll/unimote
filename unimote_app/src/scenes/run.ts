import { useLibrary } from '../store/library';
import type { Scene } from '../store/library';
import { sendCommand } from '../transport/dispatcher';
import { describeFailures, runScene, SceneResult } from './engine';

/** Runs a scene against the live library (used by the Scenes tab, shortcuts and deep links). */
export async function runSavedScene(scene: Scene): Promise<{ result: SceneResult; message: string; ok: boolean }> {
  const { remotes, catalog, updateRemote } = useLibrary.getState();
  const result = await runScene(scene, {
    remotes,
    catalog,
    send: sendCommand,
    updateSettings: (id, patch) => {
      const cur = useLibrary.getState().remotes.find(r => r.id === id)?.settings ?? {};
      updateRemote(id, { settings: { ...cur, ...patch } });
    },
  });
  const ok = result.failures.length === 0;
  return { result, ok, message: ok ? `${scene.name}: done` : describeFailures(result) };
}
