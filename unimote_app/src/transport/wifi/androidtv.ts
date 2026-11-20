import type { Remote } from '../../api/types';
import { ATV_KEYCODES } from '../../lib/atvKeys';
import { AtvError, DIRECTION_SHORT, UnimoteAtv } from '../../native/UnimoteAtv';
import { Driver, fail, ok, PairResult } from '../types';

type Atv = Pick<typeof UnimoteAtv, 'sendKey' | 'pairStart' | 'pairFinish' | 'disconnect'>;

const MAX_CODE_TRIES = 3;

function describe(e: unknown): { code: string; message: string } {
  const err = (e ?? {}) as AtvError;
  return { code: err.code ?? 'error', message: err.message ?? 'Android TV error' };
}

/** Android TV / Google TV over Wi-Fi ("Remote v2": TLS + a one-time 6-digit pairing code shown on the TV). */
export function createAndroidTvDriver(atv: Atv = UnimoteAtv): Driver {
  const mine = (r: Remote) => r.protocol === 'wifi' && r.signal_data.driver === 'android_tv';

  return {
    supports: mine,

    async send(remote, command, ctx) {
      const host = ctx.settings.host;
      if (typeof host !== 'string' || !host) return fail('needs_setup', 'Connect to your TV first.');
      const keyName = remote.signal_data.commands[command];
      const code = typeof keyName === 'string' ? ATV_KEYCODES[keyName] : undefined;
      if (code === undefined) return fail('unknown_command', `This TV profile has no "${command}" button.`);
      try {
        await atv.sendKey(host, code, DIRECTION_SHORT);
        return ok;
      } catch (e) {
        const { code: c, message } = describe(e);
        if (c === 'not_paired') return fail('pairing_failed', 'This phone is not paired with the TV any more. Connect it again.');
        if (c === 'unreachable') return fail('unreachable', "Can't reach the TV. Is it on, and on the same Wi-Fi?");
        return fail('error', message);
      }
    },

    async pair(_remote, host, _ctx, askCode): Promise<PairResult> {
      if (!host) return { ok: false, code: 'error', message: 'Pick your TV first.' };
      if (!askCode) return { ok: false, code: 'unsupported', message: 'Pairing needs the code shown on the TV.' };
      try {
        await atv.pairStart(host, 'Unimote');
        let hint: string | undefined;
        for (let attempt = 0; attempt < MAX_CODE_TRIES; attempt++) {
          const code = await askCode(hint);
          if (code === null) {
            await atv.disconnect(host);
            return { ok: false, code: 'pairing_failed', message: 'Pairing cancelled.' };
          }
          try {
            await atv.pairFinish(host, code.trim());
            return { ok: true, settings: { host }, name: undefined };
          } catch (e) {
            const { code: c, message } = describe(e);
            if (c !== 'bad_code') return { ok: false, code: c === 'unreachable' ? 'unreachable' : 'pairing_failed', message };
            hint = 'That code was not right. A new code is on the TV.';
            await atv.pairStart(host, 'Unimote'); // the TV shows a fresh code
          }
        }
        await atv.disconnect(host);
        return { ok: false, code: 'pairing_failed', message: 'The code was wrong three times. Try again.' };
      } catch (e) {
        const { code: c, message } = describe(e);
        return { ok: false, code: c === 'unreachable' ? 'unreachable' : 'error', message };
      }
    },
  };
}
