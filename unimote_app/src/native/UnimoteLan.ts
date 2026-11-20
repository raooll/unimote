import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

interface NativeLan {
  ssdpSearch(st: string, timeoutMs: number): Promise<SsdpDevice[]>;
  httpRequest(method: string, url: string, headers: Record<string, string> | null, body: string | null, timeoutMs: number): Promise<HttpResult>;
  wsOpen(id: string, url: string, insecure: boolean): Promise<void>;
  wsSend(id: string, text: string): Promise<void>;
  wsClose(id: string): void;
}

export interface SsdpDevice {
  ip: string;
  location?: string;
  st?: string;
  usn?: string;
  server?: string;
}
export interface HttpResult {
  status: number;
  body: string;
}

/** A WebSocket-like connection to a device on the local network. */
export interface LanSocket {
  /** Resolves when the connection is open; rejects if it fails before opening. */
  opened: Promise<void>;
  send(text: string): Promise<void>;
  close(): void;
  onMessage(cb: (text: string) => void): () => void;
  onClose(cb: (reason: string) => void): () => void;
}
export type SocketFactory = (url: string, opts?: { insecure?: boolean }) => LanSocket;
export type HttpFn = (method: string, url: string, opts?: { headers?: Record<string, string>; body?: string; timeoutMs?: number }) => Promise<HttpResult>;

const native: NativeLan | undefined = Platform.OS === 'android' ? NativeModules.UnimoteLan : undefined;

type SocketEvent = { id: string; type: 'open' | 'message' | 'close' | 'error'; data?: string };
const listeners = new Map<string, (e: SocketEvent) => void>();
let subscribed = false;
let counter = 0;

function ensureSubscribed() {
  if (subscribed || !native) return;
  subscribed = true;
  new NativeEventEmitter(NativeModules.UnimoteLan).addListener('UnimoteLanSocket', (e: object) => {
    const ev = e as SocketEvent;
    listeners.get(ev.id)?.(ev);
  });
}

const openSocket: SocketFactory = (url, opts) => {
  if (!native) throw new Error('Local network module not available');
  ensureSubscribed();
  const id = `s${++counter}`;
  const messageCbs = new Set<(t: string) => void>();
  const closeCbs = new Set<(r: string) => void>();
  let isOpen = false;
  let settled = false;

  const opened = new Promise<void>((resolve, reject) => {
    listeners.set(id, e => {
      if (e.type === 'open') {
        isOpen = true;
        settled = true;
        resolve();
      } else if (e.type === 'message') messageCbs.forEach(cb => cb(e.data ?? ''));
      else {
        listeners.delete(id);
        if (!settled) {
          settled = true;
          reject(new Error(e.data || 'Connection failed'));
        }
        if (isOpen || e.type === 'close') closeCbs.forEach(cb => cb(e.data ?? e.type));
      }
    });
    native.wsOpen(id, url, !!opts?.insecure).catch(err => {
      listeners.delete(id);
      settled = true;
      reject(err);
    });
  });
  opened.catch(() => {}); // callers that never await it must not trigger unhandled rejections

  return {
    opened,
    send: text => native.wsSend(id, text),
    close: () => {
      listeners.delete(id);
      native.wsClose(id);
      closeCbs.forEach(cb => cb('closed'));
    },
    onMessage: cb => (messageCbs.add(cb), () => void messageCbs.delete(cb)),
    onClose: cb => (closeCbs.add(cb), () => void closeCbs.delete(cb)),
  };
};

const http: HttpFn = async (method, url, opts) => {
  if (native) return native.httpRequest(method, url, opts?.headers ?? null, opts?.body ?? null, opts?.timeoutMs ?? 3000);
  const res = await fetch(url, { method, headers: opts?.headers, body: method === 'GET' ? undefined : opts?.body });
  return { status: res.status, body: await res.text() };
};

export const UnimoteLan = {
  available: !!native,
  openSocket,
  http,
  async ssdpSearch(st: string, timeoutMs = 2500): Promise<SsdpDevice[]> {
    return native ? native.ssdpSearch(st, timeoutMs) : [];
  },
};
