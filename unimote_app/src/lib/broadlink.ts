import type { IrSignal } from '../api/types';

const TICK_US = 8192 / 269; // one Broadlink tick, in microseconds
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(b64: string): number[] {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of clean) {
    acc = (acc << 6) | ALPHABET.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
      acc &= (1 << bits) - 1;
    }
  }
  return out;
}

/**
 * Broadlink IR packet (base64) -> IrSignal. Format: 0x26, repeat, little-endian length, then durations in
 * ticks (a 0x00 byte introduces a big-endian 16-bit tick count). The carrier is not stored; 38 kHz is assumed.
 * Returns null for anything that is not a well-formed packet.
 */
export function decodeBroadlink(b64: string): IrSignal | null {
  const bytes = base64ToBytes(b64);
  if (bytes.length < 5 || bytes[0] !== 0x26) return null;
  const length = bytes[2] | (bytes[3] << 8);
  const data = bytes.slice(4, 4 + length);
  const pattern: number[] = [];
  for (let i = 0; i < data.length; ) {
    let ticks: number;
    if (data[i] === 0) {
      if (i + 2 >= data.length) return null;
      ticks = (data[i + 1] << 8) | data[i + 2];
      i += 3;
    } else {
      ticks = data[i];
      i += 1;
    }
    const us = Math.round(ticks * TICK_US);
    if (us <= 0) return null;
    pattern.push(us);
  }
  return pattern.length >= 2 ? { frequency: 38000, duty_cycle: 0.33, pattern } : null;
}
