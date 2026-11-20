import { api as realApi } from '../api/client';
import { useAuth } from '../store/auth';
import { useLibrary } from '../store/library';
import { buildPayload, mergeSnapshot } from './merge';

export interface SyncSummary {
  added: { rooms: number; remotes: number; scenes: number };
  deleted: number;
}

let inFlight: Promise<SyncSummary> | null = null;

/**
 * Two-way sync with the account (login is optional; without a token this does nothing):
 *  1. tell the server about things deleted on this phone, 2. push everything here, 3. pull what is missing here.
 * Concurrent calls share one run.
 */
export function syncNow(api: Pick<typeof realApi, 'sync' | 'deleteSynced' | 'remote'> = realApi): Promise<SyncSummary> {
  if (!useAuth.getState().token) return Promise.reject(new Error('Sign in to sync'));
  if (inFlight) return inFlight;
  inFlight = run(api).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(api: Pick<typeof realApi, 'sync' | 'deleteSynced' | 'remote'>): Promise<SyncSummary> {
  const lib = useLibrary.getState();
  let deleted = 0;
  for (const kind of ['saved_remotes', 'scenes', 'rooms'] as const) {
    for (const id of lib.tombstones[kind]) {
      await api.deleteSynced(kind, id);
      useLibrary.getState().clearTombstones({ [kind]: [id] });
      deleted++;
    }
  }

  const before = useLibrary.getState();
  const snapshot = await api.sync(buildPayload(before));

  // Re-read: the user may have edited while the request was in flight. Merge only ever adds missing items.
  const now = useLibrary.getState();
  const stillDeleted = (kind: 'rooms' | 'saved_remotes' | 'scenes', id: string) => now.tombstones[kind].includes(id);
  const filtered = {
    ...snapshot,
    rooms: snapshot.rooms.filter(r => !stillDeleted('rooms', r.client_uuid)),
    saved_remotes: snapshot.saved_remotes.filter(r => !stillDeleted('saved_remotes', r.client_uuid)),
    scenes: snapshot.scenes.filter(s => !stillDeleted('scenes', s.client_uuid)),
  };
  const merged = mergeSnapshot(now, filtered, new Set(Object.keys(now.catalog).map(Number)));
  useLibrary.getState().applySynced({ rooms: merged.rooms, remotes: merged.remotes, scenes: merged.scenes });

  for (const id of merged.missingRemoteIds) {
    try {
      useLibrary.getState().cacheRemote(await api.remote(id));
    } catch {
      /* the remote screen retries when opened */
    }
  }
  return { added: merged.added, deleted };
}
