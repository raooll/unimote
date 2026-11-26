import type { Remote } from '../api/types';

export type SendFailure =
  | 'unsupported' // protocol/driver not available on this platform or build
  | 'no_ir_emitter' // phone has no IR blaster (needs a Wi-Fi IR hub)
  | 'unknown_command' // the remote has no signal for this button
  | 'needs_setup' // device not connected yet (no IP / hub / pairing)
  | 'pairing_failed' // the device did not accept the pairing request
  | 'unreachable' // device/hub did not answer
  | 'error';

export type SendResult = { ok: true } | { ok: false; code: SendFailure; message: string };
export type PairResult =
  | { ok: true; settings: Record<string, unknown>; name?: string }
  | { ok: false; code: SendFailure; message: string };

export interface SendContext {
  /** Per-device settings stored with the saved remote (device IP, pairing token, hub id, ...). */
  settings: Record<string, unknown>;
  /** Persist new per-device settings (e.g. a pairing token learned during a command). */
  updateSettings?: (patch: Record<string, unknown>) => void;
}

/** Shows a "type the code from your TV" prompt; resolves to the code, or null if the user cancels. */
export type AskCode = (hint?: string) => Promise<string | null>;

export interface Driver {
  supports(remote: Remote): boolean;
  send(remote: Remote, command: string, ctx: SendContext): Promise<SendResult>;
  /** Open an app on the device; `appId` is the platform's own id for it (see `lib/appShortcuts`). */
  launchApp?(remote: Remote, appId: string, ctx: SendContext): Promise<SendResult>;
  /** Connect/pair with the device at `host`; returns settings to persist. Drivers that need no pairing omit it. */
  pair?(remote: Remote, host: string, ctx: SendContext, askCode?: AskCode): Promise<PairResult>;
}

export const ok: SendResult = { ok: true };
export const fail = (code: SendFailure, message: string): SendResult => ({ ok: false, code, message });
