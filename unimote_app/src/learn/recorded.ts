import type { IrSignal, Remote, SubmissionInput } from '../api/types';
import { prettify } from '../lib/commands';

/** Buttons offered when recording a remote. */
export const RECORDABLE_BUTTONS = [
  'POWER', 'VOL_UP', 'VOL_DOWN', 'MUTE', 'CH_UP', 'CH_DOWN', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'OK', 'BACK', 'HOME', 'MENU', 'SOURCE', 'INFO',
] as const;

/** Learning hubs do not report the carrier frequency, so the near-universal 38 kHz is assumed. */
export const ASSUMED_CARRIER_HZ = 38000;

export const toSignal = (pattern: number[]): IrSignal => ({ frequency: ASSUMED_CARRIER_HZ, duty_cycle: 0.33, pattern });

export interface RecordedInput {
  brand: string;
  model: string;
  category: string;
  signals: Record<string, number[]>;
}

/** Negative id marks a remote that exists only on this phone (never synced, never fetched from the catalog). */
export function buildRecordedRemote(input: RecordedInput, id: number = -Date.now()): Remote {
  const name = `${input.brand.trim()} ${input.model.trim()}`.trim() || 'My remote';
  const commands = Object.fromEntries(Object.entries(input.signals).map(([k, p]) => [k, toSignal(p)]));
  return {
    id,
    name,
    brand: { slug: 'custom', name: input.brand.trim() || 'Custom' },
    model: { id, slug: 'custom', name: input.model.trim() || 'Recorded' },
    category: input.category,
    protocol: 'ir',
    variant: 'recorded',
    layout_template: null,
    layout: null,
    version: 1,
    checksum: '',
    updated_at: new Date().toISOString(),
    signal_data: { commands, labels: Object.fromEntries(Object.keys(commands).map(k => [k, prettify(k)])) },
  };
}

export function buildSubmission(input: RecordedInput, notes?: string): SubmissionInput {
  return {
    brand_name: input.brand.trim(),
    model_name: input.model.trim(),
    category: input.category,
    protocol: 'ir',
    notes,
    signal_data: { commands: Object.fromEntries(Object.entries(input.signals).map(([k, p]) => [k, toSignal(p)])) },
  };
}

export const isRecordedRemote = (r: { id: number }) => r.id < 0;
