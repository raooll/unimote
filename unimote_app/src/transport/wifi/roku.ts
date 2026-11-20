import type { Remote } from '../../api/types';
import { HttpFn, UnimoteLan } from '../../native/UnimoteLan';
import { Driver, fail, ok, PairResult } from '../types';

const PORT = 8060;

/** Roku External Control Protocol: plain HTTP on the local network, no pairing needed. */
export function createRokuDriver(http: HttpFn = UnimoteLan.http): Driver {
  const isRoku = (r: Remote) => r.protocol === 'wifi' && r.signal_data.driver === 'roku_ecp';
  const base = (r: Remote, host: string) => `http://${host}:${(r.signal_data.port as number) || PORT}`;

  return {
    supports: isRoku,

    async send(remote, command, ctx) {
      const host = ctx.settings.host;
      if (typeof host !== 'string' || !host) return fail('needs_setup', 'Connect to your Roku first.');
      const key = remote.signal_data.commands[command];
      if (typeof key !== 'string') return fail('unknown_command', `This remote has no "${command}" button.`);
      try {
        const res = await http('POST', `${base(remote, host)}/keypress/${encodeURIComponent(key)}`, { body: '', timeoutMs: 2500 });
        return res.status >= 200 && res.status < 300 ? ok : fail('error', `The Roku answered ${res.status}.`);
      } catch {
        return fail('unreachable', "Can't reach the Roku. Is it on the same Wi-Fi?");
      }
    },

    async pair(remote, host): Promise<PairResult> {
      try {
        const res = await http('GET', `${base(remote, host)}/query/device-info`, { timeoutMs: 2500 });
        if (res.status !== 200) return { ok: false, code: 'unreachable', message: `The device answered ${res.status}.` };
        const name = /<user-device-name>([^<]*)<\/user-device-name>/.exec(res.body)?.[1] || /<friendly-device-name>([^<]*)</.exec(res.body)?.[1];
        return { ok: true, settings: { host }, name };
      } catch {
        return { ok: false, code: 'unreachable', message: `Nothing answered at ${host}. Check the address.` };
      }
    },
  };
}
