import type { IrSignal, Remote } from '../api/types';
import { decodeBroadlink } from './broadlink';

export interface NotificationAction {
  label: string;
  frequency: number;
  pattern: number[];
}

const PREFERRED = ['POWER', 'POWER_ON', 'POWER_OFF', 'VOL_UP', 'VOL_DOWN', 'MUTE', 'CH_UP', 'CH_DOWN'];
const LABELS: Record<string, string> = {
  POWER: 'Power', POWER_ON: 'On', POWER_OFF: 'Off', VOL_UP: 'Vol +', VOL_DOWN: 'Vol −', MUTE: 'Mute', CH_UP: 'Ch +', CH_DOWN: 'Ch −',
};
export const MAX_NOTIFICATION_ACTIONS = 4;

function asSignal(raw: unknown): IrSignal | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { broadlink?: string; pattern?: unknown; frequency?: unknown };
  if (typeof r.broadlink === 'string') return decodeBroadlink(r.broadlink);
  if (Array.isArray(r.pattern) && r.pattern.length >= 2 && r.pattern.every(n => Number.isInteger(n) && (n as number) > 0) && typeof r.frequency === 'number') {
    return r as IrSignal;
  }
  return null;
}

/** Up to four buttons (power, volume, mute, channel) that have a usable IR signal. Only phone-IR remotes qualify. */
export function pickNotificationActions(remote: Pick<Remote, 'protocol' | 'signal_data'>): NotificationAction[] {
  if (remote.protocol !== 'ir') return [];
  const commands = remote.signal_data.commands;
  const keys = [...PREFERRED.filter(k => k in commands), ...Object.keys(commands).filter(k => !PREFERRED.includes(k))];
  const out: NotificationAction[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const sig = asSignal(commands[key]);
    if (!sig) continue;
    const fingerprint = `${sig.frequency}:${sig.pattern.join(',')}`;
    if (seen.has(fingerprint)) continue; // e.g. POWER and POWER_ON often share one code
    seen.add(fingerprint);
    out.push({ label: LABELS[key] ?? key.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase()), frequency: sig.frequency, pattern: sig.pattern });
    if (out.length === MAX_NOTIFICATION_ACTIONS) break;
  }
  return out;
}
