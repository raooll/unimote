import type { Remote } from '../api/types';

/** What an AC state-table remote offers (signal_data.ac). Values are the raw strings from the table. */
export interface AcMeta {
  modes: Record<string, { fans?: string[]; swings?: string[]; temps?: string[] }>;
  min_temp?: number;
  max_temp?: number;
  step?: number;
}

/** The AC's current setting. It lives in the saved remote's settings, so it survives restarts and syncs. */
export interface AcState {
  on: boolean;
  mode: string;
  fan?: string;
  swing?: string;
  temp?: string;
}

/** Same normalisation as the server's importer: UPPER_SNAKE. */
export const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

export const acMeta = (remote: Remote): AcMeta | null => {
  const ac = remote.signal_data.ac as AcMeta | undefined;
  return ac && ac.modes && Object.keys(ac.modes).length ? ac : null;
};

export const isAcRemote = (remote: Remote) => remote.layout_template === 'ac_state' && !!acMeta(remote);

/** Table key for a state, e.g. {mode:'cool', fan:'auto', temp:'24'} -> COOL_AUTO_24. */
export const stateKey = (s: Pick<AcState, 'mode' | 'fan' | 'swing' | 'temp'>) =>
  [s.mode, s.fan, s.swing, s.temp].filter((p): p is string => !!p).map(norm).join('_');

const closest = (options: string[], wanted: string | undefined): string | undefined => {
  if (!options.length) return undefined;
  if (wanted && options.includes(wanted)) return wanted;
  const w = Number(wanted);
  if (wanted != null && !Number.isNaN(w) && options.every(o => !Number.isNaN(Number(o)))) {
    return options.reduce((best, o) => (Math.abs(Number(o) - w) < Math.abs(Number(best) - w) ? o : best));
  }
  return options[0];
};

/** Preferred defaults: cool first, auto fan, "off" swing, a comfortable 24. */
export function initialState(meta: AcMeta): AcState {
  const modes = Object.keys(meta.modes);
  const mode = modes.find(m => m === 'cool') ?? modes[0];
  return fit(meta, { on: false, mode, fan: pick(meta.modes[mode].fans, ['auto', 'mid', 'medium']), swing: pick(meta.modes[mode].swings, ['off']), temp: '24' });
}

const pick = (options: string[] | undefined, prefer: string[]) => (options ?? []).find(o => prefer.includes(o)) ?? options?.[0];

/** Coerce a state to one the table actually contains (a mode may lack a fan speed or a temperature). */
export function fit(meta: AcMeta, s: AcState): AcState {
  const mode = meta.modes[s.mode] ? s.mode : Object.keys(meta.modes)[0];
  const m = meta.modes[mode];
  return {
    on: s.on,
    mode,
    fan: closest(m.fans ?? [], s.fan),
    swing: closest(m.swings ?? [], s.swing),
    temp: closest(m.temps ?? [], s.temp),
  };
}

/** Next/previous temperature step for the current mode (null at the ends or when the mode has no temperatures). */
export function stepTemp(meta: AcMeta, s: AcState, dir: 1 | -1): string | null {
  const temps = meta.modes[s.mode]?.temps ?? [];
  const i = temps.indexOf(s.temp ?? '');
  const next = temps[i + dir];
  return i >= 0 && next !== undefined ? next : null;
}

/** The command to send for a state: OFF when off, otherwise the table key. */
export function commandFor(remote: Remote, s: AcState): string {
  return s.on ? stateKey(s) : 'OFF';
}

/** Does the table really contain this state's signal? (Guards against gaps in community-made tables.) */
export const hasState = (remote: Remote, s: AcState) => stateKey(s) in remote.signal_data.commands;
