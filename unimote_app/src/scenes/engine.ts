import type { Remote } from '../api/types';
import type { SavedRemote, Scene, SceneStep } from '../store/library';
import type { SendContext, SendResult } from '../transport/types';

export type Sender = (remote: Remote, command: string, ctx: SendContext) => Promise<SendResult>;

export interface StepFailure {
  index: number;
  remoteName: string;
  command: string;
  message: string;
}
export interface SceneResult {
  ran: number;
  failures: StepFailure[];
  cancelled: boolean;
}

export interface SceneDeps {
  remotes: SavedRemote[];
  catalog: Record<number, Remote>;
  send: Sender;
  /** Wait between steps; injectable so tests do not need real timers. */
  sleep?: (ms: number) => Promise<void>;
  /** Called after each step so the UI can show progress. */
  onStep?: (index: number, total: number) => void;
  shouldCancel?: () => boolean;
  updateSettings?: (savedId: string, patch: Record<string, unknown>) => void;
}

export const MAX_STEP_DELAY_MS = 30_000;
/** Many TVs ignore a command that arrives right after another one, so steps are spaced by default. */
export const DEFAULT_GAP_MS = 350;

const realSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Runs a scene's steps in order. A failing step never stops the scene; failures are reported at the end. */
export async function runScene(scene: Pick<Scene, 'steps'>, deps: SceneDeps): Promise<SceneResult> {
  const sleep = deps.sleep ?? realSleep;
  const result: SceneResult = { ran: 0, failures: [], cancelled: false };
  const steps: SceneStep[] = scene.steps;

  for (let i = 0; i < steps.length; i++) {
    if (deps.shouldCancel?.()) {
      result.cancelled = true;
      break;
    }
    const step = steps[i];
    const saved = deps.remotes.find(r => r.id === step.remote);
    const remote = saved ? deps.catalog[saved.remoteId] : undefined;
    if (!saved || !remote) {
      result.failures.push({ index: i, remoteName: saved?.name ?? 'Removed remote', command: step.command, message: 'This remote is no longer on your phone.' });
    } else {
      const res = await deps.send(remote, step.command, {
        settings: saved.settings,
        updateSettings: patch => deps.updateSettings?.(saved.id, patch),
      });
      result.ran++;
      if (!res.ok) result.failures.push({ index: i, remoteName: saved.name, command: step.command, message: res.message });
    }
    deps.onStep?.(i + 1, steps.length);
    if (i < steps.length - 1) {
      const wait = Math.min(Math.max(step.delayMs ?? 0, 0), MAX_STEP_DELAY_MS) + DEFAULT_GAP_MS;
      await sleep(wait);
    }
  }
  return result;
}

export function describeFailures(r: SceneResult): string {
  if (r.failures.length === 0) return 'Done';
  const f = r.failures[0];
  const more = r.failures.length > 1 ? ` (+${r.failures.length - 1} more)` : '';
  return `${f.remoteName}: ${f.message}${more}`;
}
