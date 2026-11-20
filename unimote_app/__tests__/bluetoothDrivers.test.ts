import type { Remote } from '../src/api/types';
import { wifiRemote } from '../__fixtures__/remotes';

jest.mock('react-native-ble-plx', () => ({ BleManager: jest.fn() }));
jest.mock('../src/native/UnimoteHid', () => ({
  UnimoteHid: { press: jest.fn(), connect: jest.fn(), bondedDevices: jest.fn() },
  ensureBluetoothPermission: jest.fn().mockResolvedValue(true),
}));

import { createBleDriver, fillTemplate } from '../src/transport/ble';
import { createBtHidDriver } from '../src/transport/btHid';
import { hexToBase64 } from '../src/native/Ble';

const light: Remote = {
  ...wifiRemote,
  protocol: 'ble',
  signal_data: {
    service_uuid: '0000fff0-0000-1000-8000-00805f9b34fb',
    characteristic_uuid: '0000fff3-0000-1000-8000-00805f9b34fb',
    commands: { POWER_ON: '7e0004f00001ff00ef', RED: '7e070503ff000010ef' },
  },
};
const hidRemote: Remote = {
  ...wifiRemote,
  protocol: 'bluetooth_hid',
  signal_data: { commands: { HOME: { page: 12, usage: 0x223 }, BAD: 'x' } },
};

describe('BLE light driver', () => {
  it('writes the hex command to the profile characteristic', async () => {
    const client = { scan: jest.fn(), write: jest.fn().mockResolvedValue(undefined) };
    const r = await createBleDriver(client).send(light, 'RED', { settings: { deviceId: 'AA:BB' } });
    expect(r.ok).toBe(true);
    expect(client.write).toHaveBeenCalledWith('AA:BB', light.signal_data.service_uuid, light.signal_data.characteristic_uuid, '7e070503ff000010ef');
  });

  it('needs a device, knows its buttons and reports failures', async () => {
    const client = { scan: jest.fn(), write: jest.fn().mockRejectedValue(new Error('gatt')) };
    const d = createBleDriver(client);
    expect(await d.send(light, 'RED', { settings: {} })).toMatchObject({ code: 'needs_setup' });
    expect(await d.send(light, 'FLASH', { settings: { deviceId: 'x' } })).toMatchObject({ code: 'unknown_command' });
    expect(await d.send(light, 'RED', { settings: { deviceId: 'x' } })).toMatchObject({ code: 'unreachable' });
  });

  it('fills colour templates and clamps values', () => {
    expect(fillTemplate('7e070503{rr}{gg}{bb}10ef', { rr: 255, gg: 0, bb: 300 })).toBe('7e070503ff00ff10ef');
  });

  it('encodes hex as base64', () => {
    expect(hexToBase64('7e0004f00001ff00ef')).toBe('fgAE8AAB/wDv');
  });
});

describe('Bluetooth HID driver', () => {
  it('sends the usage page and id', async () => {
    const hid = { press: jest.fn().mockResolvedValue(undefined), connect: jest.fn() };
    const r = await createBtHidDriver(hid).send(hidRemote, 'HOME', { settings: { address: '11:22' } });
    expect(r.ok).toBe(true);
    expect(hid.press).toHaveBeenCalledWith(12, 0x223);
  });

  it('reconnects once when the link dropped, then retries', async () => {
    const hid = {
      press: jest.fn().mockRejectedValueOnce({ code: 'E_NOT_CONNECTED', message: 'x' }).mockResolvedValueOnce(undefined),
      connect: jest.fn().mockResolvedValue(undefined),
    };
    const r = await createBtHidDriver(hid).send(hidRemote, 'HOME', { settings: { address: '11:22' } });
    expect(r.ok).toBe(true);
    expect(hid.connect).toHaveBeenCalledWith('11:22');
    expect(hid.press).toHaveBeenCalledTimes(2);
  });

  it('gives clear failures', async () => {
    const hid = { press: jest.fn(), connect: jest.fn().mockRejectedValue({ code: 'E_BT_OFF', message: 'off' }) };
    const d = createBtHidDriver(hid);
    expect(await d.send(hidRemote, 'HOME', { settings: {} })).toMatchObject({ code: 'needs_setup' });
    expect(await d.send(hidRemote, 'BAD', { settings: { address: 'a' } })).toMatchObject({ code: 'unknown_command' });
    hid.press.mockRejectedValue({ code: 'E_NOT_CONNECTED' });
    expect(await d.send(hidRemote, 'HOME', { settings: { address: 'a' } })).toMatchObject({ ok: false, message: 'Turn Bluetooth on first.' });
  });

  it('pairs by connecting', async () => {
    const hid = { press: jest.fn(), connect: jest.fn().mockResolvedValue(undefined) };
    expect(await createBtHidDriver(hid).pair!(hidRemote, '11:22', { settings: {} })).toEqual({ ok: true, settings: { address: '11:22' } });
  });
});
