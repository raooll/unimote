import { NativeModules, Platform } from 'react-native';

export interface HubDevice {
  host: string;
  mac: string;
  devType: number;
}

interface NativeHub {
  discover(timeoutMs: number): Promise<HubDevice[]>;
  sendIr(host: string, mac: string, devType: number, pattern: number[]): Promise<void>;
  learnIr(host: string, mac: string, devType: number, timeoutMs: number): Promise<number[]>;
}

const native: NativeHub | undefined = Platform.OS === 'android' ? NativeModules.UnimoteHub : undefined;

export interface HubClient {
  discover(timeoutMs?: number): Promise<HubDevice[]>;
  sendIr(hub: HubDevice, pattern: number[]): Promise<void>;
  /** Waits for a button press on the user's original remote and returns its mark/space timings (µs). */
  learnIr(hub: HubDevice, timeoutMs?: number): Promise<number[]>;
}

export const UnimoteHub: HubClient = {
  discover: (timeoutMs = 3000) => (native ? native.discover(timeoutMs) : Promise.resolve([])),
  sendIr: (hub, pattern) => (native ? native.sendIr(hub.host, hub.mac, hub.devType, pattern) : Promise.reject(new Error('Hub module not available'))),
  learnIr: (hub, timeoutMs = 15000) =>
    native ? native.learnIr(hub.host, hub.mac, hub.devType, timeoutMs) : Promise.reject(new Error('Hub module not available')),
};
