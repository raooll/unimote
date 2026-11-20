import type { Remote } from '../api/types';
import { BleClient, bleClient } from '../native/Ble';
import { Driver, fail, ok, PairResult } from './types';

/** Colour templates like "7e070503{rr}{gg}{bb}10ef" are filled in; plain hex commands are sent as is. */
export function fillTemplate(template: string, values: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => Math.max(0, Math.min(255, Math.round(values[k] ?? 0))).toString(16).padStart(2, '0'));
}

/** Simple BLE lights: one write-only characteristic, commands are hex strings from the catalog profile. */
export function createBleDriver(client: BleClient = bleClient): Driver {
  const mine = (r: Remote) => r.protocol === 'ble';

  return {
    supports: mine,

    async send(remote, command, ctx) {
      const device = ctx.settings.deviceId;
      if (typeof device !== 'string' || !device) return fail('needs_setup', 'Connect to your light first.');
      const hex = remote.signal_data.commands[command];
      if (typeof hex !== 'string') return fail('unknown_command', `This light has no "${command}" button.`);
      const service = remote.signal_data.service_uuid as string | undefined;
      const characteristic = remote.signal_data.characteristic_uuid as string | undefined;
      if (!service || !characteristic) return fail('error', 'This light profile is incomplete.');
      try {
        await client.write(device, service, characteristic, hex);
        return ok;
      } catch {
        return fail('unreachable', "Can't reach the light. Is it powered and nearby?");
      }
    },

    async pair(remote, address): Promise<PairResult> {
      // `address` is the BLE device id chosen from the scan list.
      return remote.protocol === 'ble' && address ? { ok: true, settings: { deviceId: address } } : { ok: false, code: 'error', message: 'Pick a light first.' };
    },
  };
}

export async function scanLights(remote: Remote, client: BleClient = bleClient) {
  const prefixes = (remote.signal_data.name_prefixes as string[] | undefined) ?? [];
  return client.scan(prefixes, 6000);
}
