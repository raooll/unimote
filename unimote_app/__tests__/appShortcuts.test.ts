import type { Remote } from '../src/api/types';
import type { LanSocket } from '../src/native/UnimoteLan';
import { androidTvAppLink, appShortcutsFor, TV_APPS } from '../src/lib/appShortcuts';
import { createAndroidTvDriver } from '../src/transport/wifi/androidtv';
import { createLgDriver } from '../src/transport/wifi/lg';
import { createRokuDriver } from '../src/transport/wifi/roku';
import { createSamsungDriver } from '../src/transport/wifi/samsung';

jest.mock('../src/native/UnimoteLan', () => ({ UnimoteLan: { http: jest.fn(), openSocket: jest.fn(), ssdpSearch: jest.fn() } }));

const wifi = (driver: string) => ({ protocol: 'wifi', signal_data: { driver, commands: {} } }) as unknown as Remote;
const ir = (commands: Record<string, unknown>) => ({ protocol: 'ir', signal_data: { commands } }) as unknown as Remote;
const names = (r: Remote) => appShortcutsFor(r).map(s => s.app.id);

describe('appShortcutsFor', () => {
  it('offers every app mapped for a Wi-Fi TV platform, YouTube first', () => {
    expect(names(wifi('android_tv'))).toEqual(TV_APPS.map(a => a.id));
    expect(names(wifi('roku_ecp'))[0]).toBe('youtube');
    expect(names(wifi('roku_ecp'))).not.toContain('hotstar'); // not mapped on Roku
  });

  it('offers an IR remote only the apps it has a button for', () => {
    const s = appShortcutsFor(ir({ POWER: {}, NETFLIX: {}, AMAZON: {} }));
    expect(s.map(x => [x.app.id, x.irKey])).toEqual([['netflix', 'NETFLIX'], ['prime', 'AMAZON']]);
  });

  it('offers nothing to Bluetooth, lights or unknown Wi-Fi drivers', () => {
    expect(names({ protocol: 'bluetooth_hid', signal_data: { commands: {} } } as never)).toEqual([]);
    expect(names(wifi('something_else'))).toEqual([]);
  });

  it('turns an Android package into a launch link', () => {
    expect(androidTvAppLink('com.netflix.ninja')).toBe('market://launch?id=com.netflix.ninja');
    expect(androidTvAppLink('https://www.youtube.com')).toBe('https://www.youtube.com');
  });
});

describe('launching apps', () => {
  const ctx = { settings: { host: '10.0.0.9' } };

  it('Roku posts to /launch', async () => {
    const http = jest.fn().mockResolvedValue({ status: 200, body: '' });
    const r = { ...wifi('roku_ecp'), signal_data: { driver: 'roku_ecp', port: 8060, commands: {} } } as Remote;
    expect(await createRokuDriver(http).launchApp!(r, '837', ctx)).toEqual({ ok: true });
    expect(http).toHaveBeenCalledWith('POST', 'http://10.0.0.9:8060/launch/837', expect.anything());
  });

  it('Roku explains a missing app', async () => {
    const http = jest.fn().mockResolvedValue({ status: 404, body: '' });
    expect(await createRokuDriver(http).launchApp!(wifi('roku_ecp'), '1', ctx)).toMatchObject({ ok: false, code: 'error' });
  });

  it('Android TV sends a market launch link', async () => {
    const atv = { sendKey: jest.fn(), launchApp: jest.fn().mockResolvedValue(undefined), pairStart: jest.fn(), pairFinish: jest.fn(), disconnect: jest.fn() };
    expect(await createAndroidTvDriver(atv).launchApp!(wifi('android_tv'), 'com.netflix.ninja', ctx)).toEqual({ ok: true });
    expect(atv.launchApp).toHaveBeenCalledWith('10.0.0.9', 'market://launch?id=com.netflix.ninja');
    expect(await createAndroidTvDriver(atv).launchApp!(wifi('android_tv'), 'x', { settings: {} })).toMatchObject({ code: 'needs_setup' });
  });

  /** A socket that answers the pairing/register handshake and records what was sent. */
  function socketFactory(answer: (msg: Record<string, any>) => object | null) {
    const sent: Record<string, any>[] = [];
    const factory = () => {
      const cbs = new Set<(t: string) => void>();
      const socket: LanSocket = {
        opened: Promise.resolve(),
        send: async t => {
          const m = JSON.parse(t);
          sent.push(m);
          const reply = answer(m);
          if (reply) setTimeout(() => cbs.forEach(cb => cb(JSON.stringify(reply))), 0);
        },
        close: jest.fn(),
        onMessage: cb => (cbs.add(cb), () => void cbs.delete(cb)),
        onClose: () => () => {},
      };
      // Samsung greets as soon as the channel opens.
      setTimeout(() => cbs.forEach(cb => cb(JSON.stringify({ event: 'ms.channel.connect', data: { token: 't1' } }))), 0);
      return socket;
    };
    return { factory, sent };
  }

  it('Samsung emits ed.apps.launch', async () => {
    const { factory, sent } = socketFactory(() => null);
    expect(await createSamsungDriver(factory).launchApp!(wifi('samsung_tizen'), '111299001912', ctx)).toEqual({ ok: true });
    expect(sent.at(-1)).toEqual({
      method: 'ms.channel.emit',
      params: { event: 'ed.apps.launch', to: 'host', data: { appId: '111299001912', action_type: 'DEEP_LINK' } },
    });
  });

  it('LG asks the launcher and reports an app the TV refuses', async () => {
    const { factory, sent } = socketFactory(m => {
      if (m.type === 'register') return { id: m.id, type: 'registered', payload: { 'client-key': 'k' } };
      if (m.payload?.id === 'missing') return { id: m.id, type: 'error', error: 'app not found' };
      return { id: m.id, type: 'response', payload: { returnValue: true } };
    });
    const d = createLgDriver(factory);
    expect(await d.launchApp!(wifi('lg_webos'), 'netflix', ctx)).toEqual({ ok: true });
    expect(sent.at(-1)).toMatchObject({ type: 'request', uri: 'ssap://system.launcher/launch', payload: { id: 'netflix' } });
    expect(await d.launchApp!(wifi('lg_webos'), 'missing', ctx)).toMatchObject({ ok: false, code: 'error' });
  });
});
