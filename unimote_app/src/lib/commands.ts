import type { Remote } from '../api/types';
import { acMeta, fit, initialState, stateKey } from './acState';

export const prettify = (key: string) => key.toLowerCase().replace(/_/g, ' ').replace(/^\w/, ch => ch.toUpperCase());

/** Buttons a remote can send, in layout order first, then any extras. */
export function commandList(remote: Remote): { key: string; label: string }[] {
  const ac = remote.layout_template === 'ac_state' ? acMeta(remote) : null;
  if (ac) {
    // A state table has hundreds of signals. Offer Off plus one sensible preset per mode, not every combination.
    const out = [{ key: 'OFF', label: 'Off' }];
    for (const mode of Object.keys(ac.modes)) {
      const s = fit(ac, { ...initialState(ac), on: true, mode });
      const key = stateKey(s);
      if (key in remote.signal_data.commands) out.push({ key, label: `${prettify(mode)}${s.temp ? ` ${s.temp}°` : ''}${s.fan ? `, fan ${s.fan}` : ''}` });
    }
    return out.filter(o => o.key in remote.signal_data.commands);
  }
  const have = new Set(Object.keys(remote.signal_data.commands));
  const ordered: string[] = [];
  const layoutLabels: Record<string, string> = {};
  const add = (b?: { key: string; label?: string }) => {
    if (b && have.has(b.key) && !ordered.includes(b.key)) {
      ordered.push(b.key);
      if (b.label) layoutLabels[b.key] = b.label;
    }
  };
  for (const s of remote.layout?.sections ?? []) {
    s.buttons?.forEach(add);
    s.rockers?.forEach(r => (add(r.up), add(r.down)));
  }
  Object.keys(remote.signal_data.commands).forEach(k => add({ key: k }));
  return ordered.map(k => ({ key: k, label: remote.signal_data.labels?.[k] ?? layoutLabels[k] ?? prettify(k) }));
}
