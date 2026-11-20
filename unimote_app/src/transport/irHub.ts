import type { Remote } from '../api/types';
import { HubClient, HubDevice, UnimoteHub } from '../native/UnimoteHub';
import { isIrSignal } from './irDriver';
import { fail, ok, SendContext, SendResult } from './types';

export const hubFromSettings = (settings: Record<string, unknown>): HubDevice | undefined => {
  const h = settings.hub as Partial<HubDevice> | undefined;
  return h && typeof h.host === 'string' && typeof h.mac === 'string' && typeof h.devType === 'number' ? (h as HubDevice) : undefined;
};

/** Sends an IR remote's signal through a Wi-Fi IR hub (Broadlink RM) instead of the phone's own blaster. */
export async function sendViaHub(remote: Remote, command: string, ctx: SendContext, client: HubClient = UnimoteHub): Promise<SendResult> {
  const hub = hubFromSettings(ctx.settings);
  if (!hub) return fail('needs_setup', 'Choose an IR hub first.');
  const signal = remote.signal_data.commands[command];
  if (!isIrSignal(signal)) return fail('unknown_command', `This remote has no "${command}" button.`);
  try {
    await client.sendIr(hub, signal.pattern);
    return ok;
  } catch (e) {
    return fail('unreachable', e instanceof Error && e.message ? e.message : "Can't reach the IR hub. Is it on the same Wi-Fi?");
  }
}

export const encodeHubId = (h: HubDevice) => `${h.host}|${h.mac}|${h.devType}`;
export function decodeHubId(id: string): HubDevice | undefined {
  const [host, mac, devType] = id.split('|');
  return host && mac && devType && !Number.isNaN(Number(devType)) ? { host, mac, devType: Number(devType) } : undefined;
}
