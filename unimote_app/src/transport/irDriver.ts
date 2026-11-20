import type { IrSignal, Remote } from '../api/types';
import { UnimoteIr } from '../native/UnimoteIr';
import { Driver, fail, ok, SendResult } from './types';

export function isIrSignal(x: unknown): x is IrSignal {
  const s = x as IrSignal;
  return !!s && typeof s.frequency === 'number' && Array.isArray(s.pattern) && s.pattern.length > 1;
}

/** Fire a raw IR signal through the phone's own IR blaster. */
export async function transmitRaw(signal: IrSignal): Promise<SendResult> {
  if (!UnimoteIr.available || !(await UnimoteIr.hasIrEmitter())) {
    return fail('no_ir_emitter', 'This phone has no IR blaster. Use a Wi-Fi IR hub.');
  }
  try {
    await UnimoteIr.transmit(signal.frequency, signal.pattern);
    return ok;
  } catch (e) {
    return fail('error', e instanceof Error ? e.message : 'IR transmit failed');
  }
}

export const irDriver: Driver = {
  supports: (remote: Remote) => remote.protocol === 'ir',
  async send(remote, command) {
    const signal = remote.signal_data.commands[command];
    if (!isIrSignal(signal)) return fail('unknown_command', `This remote has no "${command}" button.`);
    return transmitRaw(signal);
  },
};
