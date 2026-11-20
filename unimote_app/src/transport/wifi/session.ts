import type { LanSocket } from '../../native/UnimoteLan';

/** Waits for the first message the predicate maps to a value; rejects on timeout or socket close. */
export function waitFor<T>(socket: LanSocket, pick: (msg: string) => T | undefined | Error, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const done = (fn: () => void) => {
      clearTimeout(timer);
      offMsg();
      offClose();
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error('Timed out waiting for the device'))), timeoutMs);
    const offMsg = socket.onMessage(msg => {
      const r = pick(msg);
      if (r === undefined) return;
      done(() => (r instanceof Error ? reject(r) : resolve(r)));
    });
    const offClose = socket.onClose(reason => done(() => reject(new Error(`Connection closed (${reason})`))));
  });
}

export const safeJson = (text: string): Record<string, any> | undefined => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** Keeps one live session per device and transparently reconnects when it has dropped. */
export class SessionCache<S extends { closed: boolean; close(): void }> {
  private map = new Map<string, Promise<S>>();

  async get(key: string, create: () => Promise<S>): Promise<S> {
    const existing = this.map.get(key);
    if (existing) {
      try {
        const s = await existing;
        if (!s.closed) return s;
      } catch {
        /* fall through and reconnect */
      }
      this.map.delete(key);
    }
    const created = create();
    this.map.set(key, created);
    created.catch(() => this.map.delete(key));
    return created;
  }

  drop(key: string) {
    this.map.get(key)?.then(s => s.close()).catch(() => {});
    this.map.delete(key);
  }
}
