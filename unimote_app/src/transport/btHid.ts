import type { Remote } from '../api/types';
import { UnimoteHid } from '../native/UnimoteHid';
import { Driver, fail, ok, PairResult } from './types';

type HidCommand = { page: number; usage: number };
type Hid = Pick<typeof UnimoteHid, 'press' | 'connect'>;

const isHid = (c: unknown): c is HidCommand => !!c && typeof c === 'object' && 'page' in c && 'usage' in c;
const REASONS: Record<string, string> = {
  E_NOT_CONNECTED: 'Not connected to the Bluetooth device.',
  E_BT_OFF: 'Turn Bluetooth on first.',
  E_PERMISSION: 'Bluetooth permission is required.',
};

/** The phone acts as a Bluetooth keyboard / media remote for a device that is already paired in Android settings. */
export function createBtHidDriver(hid: Hid = UnimoteHid): Driver {
  const mine = (r: Remote) => r.protocol === 'bluetooth_hid';

  return {
    supports: mine,

    async send(remote, command, ctx) {
      const address = ctx.settings.address;
      if (typeof address !== 'string' || !address) return fail('needs_setup', 'Connect to your device first.');
      const cmd = remote.signal_data.commands[command];
      if (!isHid(cmd)) return fail('unknown_command', `This remote has no "${command}" button.`);
      try {
        await hid.press(cmd.page, cmd.usage);
        return ok;
      } catch (e) {
        const code = (e as { code?: string }).code ?? '';
        if (code === 'E_NOT_CONNECTED') {
          try {
            await hid.connect(address); // transparently reconnect, then retry once
            await hid.press(cmd.page, cmd.usage);
            return ok;
          } catch (e2) {
            return fail('unreachable', REASONS[(e2 as { code?: string }).code ?? ''] ?? (e2 as Error).message ?? "Can't reach the device.");
          }
        }
        return fail('error', REASONS[code] ?? (e as Error).message ?? 'Bluetooth error');
      }
    },

    async pair(_remote, address): Promise<PairResult> {
      try {
        await hid.connect(address);
        return { ok: true, settings: { address } };
      } catch (e) {
        return { ok: false, code: 'pairing_failed', message: (e as Error).message || 'Could not connect.' };
      }
    },
  };
}
