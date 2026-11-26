import type { Remote } from '../../api/types';
import { LanSocket, SocketFactory, UnimoteLan } from '../../native/UnimoteLan';
import { Driver, fail, ok, PairResult, SendResult } from '../types';
import { safeJson, SessionCache, waitFor } from './session';

const PERMISSIONS = [
  'LAUNCH', 'LAUNCH_WEBAPP', 'APP_TO_APP', 'CLOSE', 'TEST_OPEN', 'TEST_PROTECTED', 'CONTROL_AUDIO', 'CONTROL_DISPLAY',
  'CONTROL_INPUT_JOYSTICK', 'CONTROL_INPUT_MEDIA_RECORDING', 'CONTROL_INPUT_MEDIA_PLAYBACK', 'CONTROL_INPUT_TV',
  'CONTROL_POWER', 'READ_APP_STATUS', 'READ_CURRENT_CHANNEL', 'READ_INPUT_DEVICE_LIST', 'READ_NETWORK_STATE',
  'READ_RUNNING_APPS', 'READ_TV_CHANNEL_LIST', 'WRITE_NOTIFICATION_TOAST', 'READ_POWER_STATE',
];

export class LgSession {
  closed = false;
  clientKey?: string;
  private seq = 0;
  private pointer?: LanSocket;
  private constructor(private socket: LanSocket, private factory: SocketFactory) {
    socket.onClose(() => (this.closed = true));
  }

  /** webOS "SSAP" over WebSocket. First connection shows a PROMPT on the TV; the returned client key is reused. */
  static async connect(host: string, clientKey: string | undefined, factory: SocketFactory): Promise<LgSession> {
    const urls = [`wss://${host}:3001`, `ws://${host}:3000`];
    let lastError: Error = new Error('Cannot connect');
    for (const url of urls) {
      const socket = factory(url, { insecure: true });
      try {
        await socket.opened;
        const session = new LgSession(socket, factory);
        const registered = waitFor<string>(
          socket,
          msg => {
            const m = safeJson(msg);
            if (m?.id !== 'register_0') return undefined;
            if (m.type === 'registered') return (m.payload?.['client-key'] as string) ?? clientKey ?? '';
            if (m.type === 'error') return new Error(m.error || 'The TV refused the connection');
            return undefined; // pairing prompt is showing: keep waiting
          },
          clientKey ? 8000 : 40000,
        );
        await socket.send(
          JSON.stringify({
            type: 'register',
            id: 'register_0',
            payload: {
              forcePairing: false,
              pairingType: 'PROMPT',
              ...(clientKey ? { 'client-key': clientKey } : {}),
              manifest: { manifestVersion: 1, appVersion: '1.1', permissions: PERMISSIONS },
            },
          }),
        );
        session.clientKey = await registered;
        return session;
      } catch (e) {
        socket.close();
        lastError = e instanceof Error ? e : lastError;
      }
    }
    throw lastError;
  }

  async request(uri: string, payload?: Record<string, unknown>): Promise<Record<string, any>> {
    const id = `req_${++this.seq}`;
    const reply = waitFor<Record<string, any>>(
      this.socket,
      msg => {
        const m = safeJson(msg);
        if (m?.id !== id) return undefined;
        if (m.type === 'error' || m.payload?.returnValue === false) return new Error(m.error || m.payload?.errorText || 'Request failed');
        return (m.payload ?? {}) as Record<string, any>;
      },
      5000,
    );
    await this.socket.send(JSON.stringify({ type: 'request', id, uri, ...(payload ? { payload } : {}) }));
    return reply;
  }

  /** D-pad / Back / Home etc. go through the TV's pointer-input socket. */
  async button(name: string): Promise<void> {
    if (!this.pointer) {
      const r = await this.request('ssap://com.webos.service.networkinput/getPointerInputSocket');
      const path = r.socketPath as string | undefined;
      if (!path) throw new Error('The TV gave no input socket');
      const sock = this.factory(path, { insecure: true });
      await sock.opened;
      sock.onClose(() => (this.pointer = undefined));
      this.pointer = sock;
    }
    await this.pointer.send(`type:button\nname:${name}\n\n`);
  }

  async toggleMute(): Promise<void> {
    const status = await this.request('ssap://audio/getStatus');
    await this.request('ssap://audio/setMute', { mute: !status.mute });
  }

  close() {
    this.closed = true;
    this.pointer?.close();
    this.socket.close();
  }
}

type LgCommand = { uri?: string; button?: string; toggle?: boolean };

/** LG webOS TVs. Note: webOS cannot be switched ON over the network (that needs Wake-on-LAN or IR). */
export function createLgDriver(factory: SocketFactory = UnimoteLan.openSocket): Driver {
  const sessions = new SessionCache<LgSession>();
  const mine = (r: Remote) => r.protocol === 'wifi' && r.signal_data.driver === 'lg_webos';

  return {
    supports: mine,

    async send(remote, command, ctx): Promise<SendResult> {
      const host = ctx.settings.host;
      if (typeof host !== 'string' || !host) return fail('needs_setup', 'Connect to your LG TV first.');
      const cmd = remote.signal_data.commands[command] as LgCommand | undefined;
      if (!cmd || typeof cmd !== 'object') return fail('unknown_command', `This remote has no "${command}" button.`);
      const key = typeof ctx.settings.clientKey === 'string' ? ctx.settings.clientKey : undefined;
      try {
        const session = await sessions.get(host, () => LgSession.connect(host, key, factory));
        if (session.clientKey && session.clientKey !== key) ctx.updateSettings?.({ clientKey: session.clientKey });
        if (cmd.button) await session.button(cmd.button);
        else if (cmd.uri === 'ssap://audio/setMute' && cmd.toggle) await session.toggleMute();
        else if (cmd.uri) await session.request(cmd.uri);
        else return fail('unknown_command', `"${command}" is not supported on this TV.`);
        return ok;
      } catch (e) {
        sessions.drop(host);
        return fail('unreachable', e instanceof Error ? e.message : "Can't reach the TV.");
      }
    },

    async launchApp(_remote, appId, ctx): Promise<SendResult> {
      const host = ctx.settings.host;
      if (typeof host !== 'string' || !host) return fail('needs_setup', 'Connect to your LG TV first.');
      const key = typeof ctx.settings.clientKey === 'string' ? ctx.settings.clientKey : undefined;
      let session: LgSession;
      try {
        session = await sessions.get(host, () => LgSession.connect(host, key, factory));
        if (session.clientKey && session.clientKey !== key) ctx.updateSettings?.({ clientKey: session.clientKey });
      } catch (e) {
        sessions.drop(host);
        return fail('unreachable', e instanceof Error ? e.message : "Can't reach the TV.");
      }
      try {
        await session.request('ssap://system.launcher/launch', { id: appId });
        return ok;
      } catch {
        // The TV answered but refused: almost always an app that is not installed.
        return fail('error', 'The TV could not open this app. Is it installed?');
      }
    },

    async pair(_remote, host, ctx): Promise<PairResult> {
      try {
        sessions.drop(host);
        const key = typeof ctx.settings.clientKey === 'string' ? ctx.settings.clientKey : undefined;
        const session = await sessions.get(host, () => LgSession.connect(host, key, factory));
        return { ok: true, settings: { host, ...(session.clientKey ? { clientKey: session.clientKey } : {}) } };
      } catch (e) {
        return { ok: false, code: 'pairing_failed', message: e instanceof Error ? e.message : 'Pairing failed' };
      }
    },
  };
}
