import type { Remote } from '../src/api/types';
import type { LanSocket } from '../src/native/UnimoteLan';
import { createLgDriver } from '../src/transport/wifi/lg';
import { createRokuDriver } from '../src/transport/wifi/roku';
import { createSamsungDriver } from '../src/transport/wifi/samsung';
import { toBase64 } from '../src/lib/base64';
import { wifiRemote } from '../__fixtures__/remotes';

jest.mock('../src/native/UnimoteLan', () => ({ UnimoteLan: { http: jest.fn(), openSocket: jest.fn(), ssdpSearch: jest.fn() } }));

const make = (signal_data: Remote['signal_data']): Remote => ({ ...wifiRemote, signal_data });

/** A scripted fake socket: `reply` is called for every message the app sends. */
function fakeSocket(opts: { onSend?: (text: string, push: (m: object) => void) => void; open?: boolean; greeting?: object[] } = {}) {
  const msgCbs = new Set<(t: string) => void>();
  const closeCbs = new Set<(r: string) => void>();
  const sent: string[] = [];
  const push = (m: object) => setTimeout(() => msgCbs.forEach(cb => cb(JSON.stringify(m))), 0);
  const socket: LanSocket = {
    opened: opts.open === false ? Promise.reject(new Error('refused')) : Promise.resolve(),
    send: async t => {
      sent.push(t);
      opts.onSend?.(t, push);
    },
    close: jest.fn(() => closeCbs.forEach(cb => cb('closed'))),
    onMessage: cb => (msgCbs.add(cb), () => void msgCbs.delete(cb)),
    onClose: cb => (closeCbs.add(cb), () => void closeCbs.delete(cb)),
  };
  (opts.greeting ?? []).forEach(push);
  return { socket, sent };
}

describe('base64', () => {
  it('encodes like the standard', () => {
    expect(toBase64('Unimote')).toBe('VW5pbW90ZQ==');
    expect(toBase64('ab')).toBe('YWI=');
    expect(toBase64('abc')).toBe('YWJj');
  });
});

describe('Roku driver', () => {
  const remote = make({ driver: 'roku_ecp', port: 8060, commands: { POWER: 'Power', VOL_UP: 'VolumeUp' } });

  it('posts the keypress to the device', async () => {
    const http = jest.fn().mockResolvedValue({ status: 200, body: '' });
    const r = await createRokuDriver(http).send(remote, 'VOL_UP', { settings: { host: '192.168.1.5' } });
    expect(r.ok).toBe(true);
    expect(http).toHaveBeenCalledWith('POST', 'http://192.168.1.5:8060/keypress/VolumeUp', expect.anything());
  });

  it('asks for setup when no host is stored', async () => {
    const r = await createRokuDriver(jest.fn()).send(remote, 'POWER', { settings: {} });
    expect(r).toMatchObject({ ok: false, code: 'needs_setup' });
  });

  it('reports unknown buttons and unreachable devices', async () => {
    const down = jest.fn().mockRejectedValue(new Error('timeout'));
    const d = createRokuDriver(down);
    expect(await d.send(remote, 'HDMI_1', { settings: { host: 'h' } })).toMatchObject({ code: 'unknown_command' });
    expect(await d.send(remote, 'POWER', { settings: { host: 'h' } })).toMatchObject({ code: 'unreachable' });
  });

  it('pairs by reading device info and returns the name', async () => {
    const http = jest.fn().mockResolvedValue({ status: 200, body: '<device-info><user-device-name>Living Room</user-device-name></device-info>' });
    const r = await createRokuDriver(http).pair!(remote, '192.168.1.5', { settings: {} });
    expect(r).toEqual({ ok: true, settings: { host: '192.168.1.5' }, name: 'Living Room' });
  });
});

describe('Samsung driver', () => {
  const remote = make({ driver: 'samsung_tizen', commands: { VOL_UP: 'KEY_VOLUP' } });

  it('connects, saves the token and sends the key', async () => {
    const { socket, sent } = fakeSocket({ greeting: [{ event: 'ms.channel.connect', data: { token: 'TOK1' } }] });
    const factory = jest.fn().mockReturnValue(socket);
    const updateSettings = jest.fn();
    const r = await createSamsungDriver(factory).send(remote, 'VOL_UP', { settings: { host: '10.0.0.9' }, updateSettings });
    expect(r.ok).toBe(true);
    expect(factory.mock.calls[0][0]).toContain('wss://10.0.0.9:8002/api/v2/channels/samsung.remote.control?name=VW5pbW90ZQ%3D%3D');
    expect(factory.mock.calls[0][1]).toEqual({ insecure: true });
    expect(updateSettings).toHaveBeenCalledWith({ token: 'TOK1' });
    expect(JSON.parse(sent[0])).toMatchObject({ method: 'ms.remote.control', params: { Cmd: 'Click', DataOfCmd: 'KEY_VOLUP' } });
  });

  it('reuses a stored token and the live session', async () => {
    const { socket } = fakeSocket({ greeting: [{ event: 'ms.channel.connect', data: {} }] });
    const factory = jest.fn().mockReturnValue(socket);
    const d = createSamsungDriver(factory);
    const ctx = { settings: { host: '10.0.0.9', token: 'OLD' } };
    await d.send(remote, 'VOL_UP', ctx);
    await d.send(remote, 'VOL_UP', ctx);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory.mock.calls[0][0]).toContain('token=OLD');
  });

  it('falls back to ws:8001 and fails cleanly when the TV denies the connection', async () => {
    const denied = fakeSocket({ greeting: [{ event: 'ms.channel.timeout' }] });
    const refused = fakeSocket({ open: false });
    const factory = jest.fn().mockReturnValueOnce(refused.socket).mockReturnValueOnce(denied.socket);
    const r = await createSamsungDriver(factory).pair!(remote, '10.0.0.9', { settings: {} });
    expect(factory.mock.calls[1][0]).toContain('ws://10.0.0.9:8001/');
    expect(r).toMatchObject({ ok: false, code: 'pairing_failed', message: expect.stringContaining('did not allow') });
  });
});

describe('LG driver', () => {
  const remote = make({
    driver: 'lg_webos',
    commands: {
      VOL_UP: { uri: 'ssap://audio/volumeUp' },
      MUTE: { uri: 'ssap://audio/setMute', toggle: true },
      OK: { button: 'ENTER' },
    },
  });

  function tv(muted = false) {
    const pointer = fakeSocket();
    const main = fakeSocket({
      onSend: (text, push) => {
        const m = JSON.parse(text);
        if (m.type === 'register') {
          push({ id: 'register_0', type: 'response', payload: { pairingType: 'PROMPT' } }); // user is being prompted
          push({ id: 'register_0', type: 'registered', payload: { 'client-key': 'CK1' } });
        } else if (m.uri === 'ssap://audio/getStatus') push({ id: m.id, type: 'response', payload: { returnValue: true, mute: muted } });
        else if (m.uri === 'ssap://com.webos.service.networkinput/getPointerInputSocket')
          push({ id: m.id, type: 'response', payload: { returnValue: true, socketPath: 'wss://10.0.0.7:3001/pointer' } });
        else push({ id: m.id, type: 'response', payload: { returnValue: true } });
      },
    });
    const factory = jest.fn((url: string) => (url.includes('/pointer') ? pointer.socket : main.socket));
    return { factory, main, pointer };
  }

  it('registers, stores the client key and sends an SSAP request', async () => {
    const { factory, main } = tv();
    const updateSettings = jest.fn();
    const r = await createLgDriver(factory).send(remote, 'VOL_UP', { settings: { host: '10.0.0.7' }, updateSettings });
    expect(r.ok).toBe(true);
    expect(updateSettings).toHaveBeenCalledWith({ clientKey: 'CK1' });
    expect(main.sent.map(s => JSON.parse(s).uri).filter(Boolean)).toContain('ssap://audio/volumeUp');
  });

  it('toggles mute based on the current state', async () => {
    const { factory, main } = tv(true);
    await createLgDriver(factory).send(remote, 'MUTE', { settings: { host: '10.0.0.7' } });
    const setMute = main.sent.map(s => JSON.parse(s)).find(m => m.uri === 'ssap://audio/setMute');
    expect(setMute.payload).toEqual({ mute: false });
  });

  it('sends D-pad buttons through the pointer socket', async () => {
    const { factory, pointer } = tv();
    const r = await createLgDriver(factory).send(remote, 'OK', { settings: { host: '10.0.0.7' } });
    expect(r.ok).toBe(true);
    expect(pointer.sent).toEqual(['type:button\nname:ENTER\n\n']);
  });

  it('reports an unreachable TV', async () => {
    const dead = fakeSocket({ open: false });
    const r = await createLgDriver(() => dead.socket).send(remote, 'VOL_UP', { settings: { host: '10.0.0.7' } });
    expect(r).toMatchObject({ ok: false, code: 'unreachable' });
  });
});

describe('IR hub routing', () => {
  const { sendViaHub, decodeHubId, encodeHubId } = jest.requireActual('../src/transport/irHub');
  const { irRemote } = jest.requireActual('../__fixtures__/remotes');
  const hub = { host: '192.168.1.9', mac: 'aa:bb:cc:dd:ee:ff', devType: 0x2712 };

  it('sends the raw pattern to the hub', async () => {
    const client = { discover: jest.fn(), sendIr: jest.fn().mockResolvedValue(undefined) };
    const r = await sendViaHub(irRemote, 'POWER', { settings: { hub } }, client);
    expect(r.ok).toBe(true);
    expect(client.sendIr).toHaveBeenCalledWith(hub, irRemote.signal_data.commands.POWER.pattern);
  });

  it('needs a hub, knows its buttons and reports an unreachable hub', async () => {
    const client = { discover: jest.fn(), sendIr: jest.fn().mockRejectedValue(new Error('')) };
    expect(await sendViaHub(irRemote, 'POWER', { settings: {} }, client)).toMatchObject({ code: 'needs_setup' });
    expect(await sendViaHub(irRemote, 'STOP', { settings: { hub } }, client)).toMatchObject({ code: 'unknown_command' });
    expect(await sendViaHub(irRemote, 'POWER', { settings: { hub } }, client)).toMatchObject({ code: 'unreachable' });
  });

  it('round-trips the hub id used by the connect list', () => {
    expect(decodeHubId(encodeHubId(hub))).toEqual(hub);
    expect(decodeHubId('nope')).toBeUndefined();
  });
});
