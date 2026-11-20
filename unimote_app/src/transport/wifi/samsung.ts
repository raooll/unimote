import type { Remote } from '../../api/types';
import { toBase64 } from '../../lib/base64';
import { LanSocket, SocketFactory, UnimoteLan } from '../../native/UnimoteLan';
import { Driver, fail, ok, PairResult, SendResult } from '../types';
import { safeJson, SessionCache, waitFor } from './session';

const APP_NAME = 'Unimote';

export class SamsungSession {
  closed = false;
  token?: string;
  private constructor(private socket: LanSocket) {
    socket.onClose(() => (this.closed = true));
  }

  /** Opens the remote channel. A first-time connection makes the TV ask the user to allow it (up to 40 s). */
  static async connect(host: string, token: string | undefined, factory: SocketFactory): Promise<SamsungSession> {
    const q = `name=${encodeURIComponent(toBase64(APP_NAME))}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
    const urls = [`wss://${host}:8002/api/v2/channels/samsung.remote.control?${q}`, `ws://${host}:8001/api/v2/channels/samsung.remote.control?${q}`];
    let lastError: Error = new Error('Cannot connect');
    for (const url of urls) {
      const socket = factory(url, { insecure: true });
      try {
        await socket.opened;
        const session = new SamsungSession(socket);
        session.token = await waitFor<string>(
          socket,
          msg => {
            const m = safeJson(msg);
            if (m?.event === 'ms.channel.connect') return (m.data?.token as string | undefined) ?? token ?? '';
            if (m?.event === 'ms.channel.timeout' || m?.event === 'ms.error') return new Error('The TV did not allow the connection');
            return undefined;
          },
          token ? 6000 : 40000,
        );
        return session;
      } catch (e) {
        socket.close();
        lastError = e instanceof Error ? e : lastError;
      }
    }
    throw lastError;
  }

  async sendKey(key: string): Promise<void> {
    await this.socket.send(
      JSON.stringify({
        method: 'ms.remote.control',
        params: { Cmd: 'Click', DataOfCmd: key, Option: 'false', TypeOfRemote: 'SendRemoteKey' },
      }),
    );
  }

  close() {
    this.closed = true;
    this.socket.close();
  }
}

/** Samsung Tizen (2016+) over the local WebSocket remote channel. Pairing token is stored per saved remote. */
export function createSamsungDriver(factory: SocketFactory = UnimoteLan.openSocket): Driver {
  const sessions = new SessionCache<SamsungSession>();
  const mine = (r: Remote) => r.protocol === 'wifi' && r.signal_data.driver === 'samsung_tizen';

  return {
    supports: mine,

    async send(remote, command, ctx): Promise<SendResult> {
      const host = ctx.settings.host;
      if (typeof host !== 'string' || !host) return fail('needs_setup', 'Connect to your Samsung TV first.');
      const key = remote.signal_data.commands[command];
      if (typeof key !== 'string') return fail('unknown_command', `This remote has no "${command}" button.`);
      const token = typeof ctx.settings.token === 'string' ? ctx.settings.token : undefined;
      try {
        const session = await sessions.get(host, () => SamsungSession.connect(host, token, factory));
        if (session.token && session.token !== token) ctx.updateSettings?.({ token: session.token });
        await session.sendKey(key);
        return ok;
      } catch (e) {
        sessions.drop(host);
        return fail('unreachable', e instanceof Error ? e.message : "Can't reach the TV.");
      }
    },

    async pair(_remote, host, ctx): Promise<PairResult> {
      try {
        sessions.drop(host);
        const token = typeof ctx.settings.token === 'string' ? ctx.settings.token : undefined;
        const session = await sessions.get(host, () => SamsungSession.connect(host, token, factory));
        return { ok: true, settings: { host, ...(session.token ? { token: session.token } : {}) } };
      } catch (e) {
        return { ok: false, code: 'pairing_failed', message: e instanceof Error ? e.message : 'Pairing failed' };
      }
    },
  };
}
