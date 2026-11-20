import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

interface NativeHid {
  isSupported(): Promise<boolean>;
  bondedDevices(): Promise<BondedDevice[]>;
  connect(address: string): Promise<void>;
  press(page: number, usage: number): Promise<void>;
  disconnect(): Promise<void>;
}
export interface BondedDevice {
  name: string;
  address: string;
}

const native: NativeHid | undefined = Platform.OS === 'android' ? NativeModules.UnimoteHid : undefined;

/** Android 12+ needs BLUETOOTH_CONNECT/SCAN at runtime; older versions use install-time permissions. */
export async function ensureBluetoothPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (Platform.Version < 31) return true;
  const res = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
  ]);
  return Object.values(res).every(v => v === PermissionsAndroid.RESULTS.GRANTED);
}

export const UnimoteHid = {
  isSupported: () => (native ? native.isSupported().catch(() => false) : Promise.resolve(false)),
  bondedDevices: () => (native ? native.bondedDevices() : Promise.resolve([])),
  connect: (address: string) => (native ? native.connect(address) : Promise.reject(new Error('Bluetooth is not available'))),
  press: (page: number, usage: number) => (native ? native.press(page, usage) : Promise.reject(new Error('Bluetooth is not available'))),
  disconnect: () => (native ? native.disconnect() : Promise.resolve()),
};
