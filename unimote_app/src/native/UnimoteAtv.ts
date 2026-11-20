import { NativeModules, Platform } from 'react-native';

interface NativeAtv {
  discover(timeoutMs: number): Promise<AtvDevice[]>;
  pairStart(host: string, clientName: string): Promise<void>;
  pairFinish(host: string, code: string): Promise<void>;
  sendKey(host: string, keyCode: number, direction: number): Promise<void>;
  disconnect(host: string): Promise<void>;
}
export interface AtvDevice {
  ip: string;
  name: string;
  port: number;
}

// Implemented in Kotlin (android/.../atv/UnimoteAtvModule). Absent on iOS and in tests.
const native: NativeAtv | undefined = Platform.OS === 'android' ? NativeModules.UnimoteAtv : undefined;

export const DIRECTION_SHORT = 3;

/** Native errors carry a short `code` (unreachable, not_paired, bad_code, pairing_rejected, error). */
export type AtvError = { code?: string; message?: string };

export const UnimoteAtv = {
  available: !!native,
  discover: (timeoutMs = 3000): Promise<AtvDevice[]> => (native ? native.discover(timeoutMs) : Promise.resolve([])),
  pairStart(host: string, clientName = 'Unimote'): Promise<void> {
    if (!native) return Promise.reject({ code: 'error', message: 'Android TV control is not available in this build' } as AtvError);
    return native.pairStart(host, clientName);
  },
  pairFinish(host: string, code: string): Promise<void> {
    if (!native) return Promise.reject({ code: 'error', message: 'Android TV control is not available in this build' } as AtvError);
    return native.pairFinish(host, code);
  },
  sendKey(host: string, keyCode: number, direction = DIRECTION_SHORT): Promise<void> {
    if (!native) return Promise.reject({ code: 'error', message: 'Android TV control is not available in this build' } as AtvError);
    return native.sendKey(host, keyCode, direction);
  },
  disconnect: (host: string): Promise<void> => (native ? native.disconnect(host) : Promise.resolve()),
};
