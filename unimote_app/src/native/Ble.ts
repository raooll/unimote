import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import { ensureBluetoothPermission } from './UnimoteHid';

export interface BleFound {
  id: string;
  name: string;
}

/** The small surface the BLE driver needs; faked in tests. */
export interface BleClient {
  scan(namePrefixes: string[], timeoutMs: number): Promise<BleFound[]>;
  write(deviceId: string, serviceUuid: string, characteristicUuid: string, hex: string): Promise<void>;
}

let manager: BleManager | undefined;
const mgr = () => (manager ??= new BleManager());

export const hexToBase64 = (hex: string): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = (hex.match(/../g) ?? []).map(h => parseInt(h, 16));
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    out += chars[a >> 2] + chars[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : chars[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : chars[c & 63];
  }
  return out;
};

export const bleClient: BleClient = {
  async scan(namePrefixes, timeoutMs) {
    if (Platform.OS !== 'android' || !(await ensureBluetoothPermission())) throw new Error('Bluetooth permission was denied');
    if (Platform.Version < 31) await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    const found = new Map<string, BleFound>();
    await new Promise<void>((resolve, reject) => {
      const m = mgr();
      const stop = () => {
        m.stopDeviceScan();
        resolve();
      };
      setTimeout(stop, timeoutMs);
      m.startDeviceScan(null, null, (err, d) => {
        if (err) {
          m.stopDeviceScan();
          reject(err);
          return;
        }
        const name = d?.name ?? d?.localName ?? '';
        if (d && name && namePrefixes.some(p => name.startsWith(p))) found.set(d.id, { id: d.id, name });
      });
    });
    return [...found.values()];
  },

  async write(deviceId, serviceUuid, characteristicUuid, hex) {
    const m = mgr();
    const device = (await m.isDeviceConnected(deviceId)) ? (await m.devices([deviceId]))[0] : await m.connectToDevice(deviceId, { timeout: 8000 });
    await device.discoverAllServicesAndCharacteristics();
    await device.writeCharacteristicWithoutResponseForService(serviceUuid, characteristicUuid, hexToBase64(hex));
  },
};
