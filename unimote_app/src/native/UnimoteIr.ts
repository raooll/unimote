import { NativeModules, Platform } from 'react-native';

interface NativeIr {
  hasIrEmitter(): Promise<boolean>;
  transmit(frequency: number, pattern: number[]): Promise<void>;
}

// Implemented in Kotlin (android/.../UnimoteIrModule). Absent on iOS and in tests.
const native: NativeIr | undefined = Platform.OS === 'android' ? NativeModules.UnimoteIr : undefined;

export const UnimoteIr = {
  /** The native module is compiled into this build. */
  available: !!native,
  async hasIrEmitter(): Promise<boolean> {
    return native ? native.hasIrEmitter() : false;
  },
  async transmit(frequency: number, pattern: number[]): Promise<void> {
    if (!native) throw new Error('IR module not available');
    await native.transmit(frequency, pattern);
  },
};
