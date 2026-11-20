import { createAndroidTvDriver } from '../src/transport/wifi/androidtv';
import { ATV_KEYCODES } from '../src/lib/atvKeys';

const remote = {
  protocol: 'wifi',
  signal_data: { driver: 'android_tv', commands: { POWER: 'KEYCODE_POWER', VOL_UP: 'KEYCODE_VOLUME_UP', WEIRD: 'KEYCODE_NOPE' } },
} as never;

const makeAtv = () => ({
  sendKey: jest.fn().mockResolvedValue(undefined),
  pairStart: jest.fn().mockResolvedValue(undefined),
  pairFinish: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
});

describe('Android TV driver', () => {
  it('only claims Android TV Wi-Fi profiles', () => {
    const d = createAndroidTvDriver(makeAtv());
    expect(d.supports(remote)).toBe(true);
    expect(d.supports({ protocol: 'wifi', signal_data: { driver: 'roku_ecp', commands: {} } } as never)).toBe(false);
    expect(d.supports({ protocol: 'ir', signal_data: { driver: 'android_tv', commands: {} } } as never)).toBe(false);
  });

  it('sends the Android key code for a button', async () => {
    const atv = makeAtv();
    expect(await createAndroidTvDriver(atv).send(remote, 'VOL_UP', { settings: { host: '10.0.0.4' } })).toEqual({ ok: true });
    expect(atv.sendKey).toHaveBeenCalledWith('10.0.0.4', 24, 3);
  });

  it('explains missing setup, unknown buttons and unmapped keys', async () => {
    const d = createAndroidTvDriver(makeAtv());
    expect(await d.send(remote, 'POWER', { settings: {} })).toMatchObject({ ok: false, code: 'needs_setup' });
    expect(await d.send(remote, 'NOPE', { settings: { host: 'h' } })).toMatchObject({ ok: false, code: 'unknown_command' });
    expect(await d.send(remote, 'WEIRD', { settings: { host: 'h' } })).toMatchObject({ ok: false, code: 'unknown_command' });
  });

  it('maps native errors to messages a person can act on', async () => {
    const atv = makeAtv();
    const d = createAndroidTvDriver(atv);
    atv.sendKey.mockRejectedValueOnce({ code: 'not_paired' });
    expect(await d.send(remote, 'POWER', { settings: { host: 'h' } })).toMatchObject({ ok: false, code: 'pairing_failed' });
    atv.sendKey.mockRejectedValueOnce({ code: 'unreachable' });
    expect(await d.send(remote, 'POWER', { settings: { host: 'h' } })).toMatchObject({ ok: false, code: 'unreachable' });
  });

  it('pairs with the code the user types and stores the TV address', async () => {
    const atv = makeAtv();
    const ask = jest.fn().mockResolvedValue('85EE2B');
    expect(await createAndroidTvDriver(atv).pair!(remote, '10.0.0.4', { settings: {} }, ask)).toEqual({ ok: true, settings: { host: '10.0.0.4' }, name: undefined });
    expect(atv.pairStart).toHaveBeenCalledWith('10.0.0.4', 'Unimote');
    expect(atv.pairFinish).toHaveBeenCalledWith('10.0.0.4', '85EE2B');
  });

  it('asks again after a wrong code, with a fresh code on the TV', async () => {
    const atv = makeAtv();
    atv.pairFinish.mockRejectedValueOnce({ code: 'bad_code' });
    const ask = jest.fn().mockResolvedValueOnce('000000').mockResolvedValueOnce('85EE2B');
    const res = await createAndroidTvDriver(atv).pair!(remote, 'h', { settings: {} }, ask);
    expect(res).toMatchObject({ ok: true });
    expect(atv.pairStart).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[1][0]).toMatch(/not right/);
  });

  it('gives up after three wrong codes, and stops cleanly when cancelled', async () => {
    const atv = makeAtv();
    atv.pairFinish.mockRejectedValue({ code: 'bad_code' });
    const wrong = await createAndroidTvDriver(atv).pair!(remote, 'h', { settings: {} }, async () => '000000');
    expect(wrong).toMatchObject({ ok: false, code: 'pairing_failed' });
    expect(atv.pairFinish).toHaveBeenCalledTimes(3);
    const cancelled = await createAndroidTvDriver(makeAtv()).pair!(remote, 'h', { settings: {} }, async () => null);
    expect(cancelled).toMatchObject({ ok: false, message: 'Pairing cancelled.' });
  });

  it('reports an unreachable TV while pairing', async () => {
    const atv = makeAtv();
    atv.pairStart.mockRejectedValue({ code: 'unreachable', message: 'Cannot reach the TV' });
    expect(await createAndroidTvDriver(atv).pair!(remote, 'h', { settings: {} }, async () => '000000')).toMatchObject({ ok: false, code: 'unreachable' });
  });

  it('has a key code for every key name', () => {
    expect(Object.values(ATV_KEYCODES).every(n => Number.isInteger(n) && n > 0)).toBe(true);
    expect(ATV_KEYCODES.KEYCODE_POWER).toBe(26);
    expect(ATV_KEYCODES.KEYCODE_DPAD_CENTER).toBe(23);
  });
});
