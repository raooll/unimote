import type { SyncPayload, SyncSnapshot } from '../api/types';
import type { Room, SavedRemote, Scene } from '../store/library';

/** Pairing secrets stay on the phone; they are never uploaded. */
const SECRET_SETTINGS = ['token', 'clientKey'];
export const stripSecrets = (settings: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(settings).filter(([k]) => !SECRET_SETTINGS.includes(k)));

interface Local {
  rooms: Room[];
  remotes: SavedRemote[];
  scenes: Scene[];
}

/** Recorded-by-the-user remotes have negative ids and exist only on this phone. */
const isSyncable = (r: SavedRemote) => r.remoteId > 0;

export function buildPayload(local: Local): SyncPayload {
  const syncable = new Set(local.remotes.filter(isSyncable).map(r => r.id));
  return {
    rooms: local.rooms.map(r => ({ client_uuid: r.id, name: r.name, icon: r.icon ?? null, position: r.position })),
    saved_remotes: local.remotes.filter(isSyncable).map(r => ({
      client_uuid: r.id,
      name: r.name,
      position: r.position,
      settings: stripSecrets(r.settings),
      remote_config_id: r.remoteId,
      room_client_uuid: r.roomId,
    })),
    scenes: local.scenes.map(s => ({
      client_uuid: s.id,
      name: s.name,
      icon: s.icon ?? null,
      position: s.position,
      // Steps pointing at phone-only remotes cannot run elsewhere, so they are not uploaded.
      steps: s.steps
        .filter(st => syncable.has(st.remote) || !local.remotes.some(r => r.id === st.remote))
        .map(st => ({ remote: st.remote, command: st.command, delay_ms: st.delayMs ?? null })),
    })),
  };
}

export interface MergeResult extends Local {
  /** Catalog remote ids the server references that this phone has not cached yet. */
  missingRemoteIds: number[];
  added: { rooms: number; remotes: number; scenes: number };
}

/** The phone's copy wins when an item exists on both sides; the server only adds what the phone lacks. */
export function mergeSnapshot(local: Local, snap: SyncSnapshot, cachedRemoteIds: Set<number>): MergeResult {
  const rooms = [...local.rooms];
  const remotes = [...local.remotes];
  const scenes = [...local.scenes];
  const added = { rooms: 0, remotes: 0, scenes: 0 };

  for (const r of snap.rooms) {
    if (rooms.some(x => x.id === r.client_uuid)) continue;
    rooms.push({ id: r.client_uuid, name: r.name, icon: r.icon ?? undefined, position: rooms.length });
    added.rooms++;
  }
  const roomIds = new Set(rooms.map(r => r.id));

  for (const r of snap.saved_remotes) {
    if (remotes.some(x => x.id === r.client_uuid)) continue;
    remotes.push({
      id: r.client_uuid,
      name: r.name,
      roomId: r.room_client_uuid && roomIds.has(r.room_client_uuid) ? r.room_client_uuid : null,
      remoteId: r.remote_config_id,
      position: remotes.length,
      settings: r.settings ?? {},
    });
    added.remotes++;
  }

  for (const s of snap.scenes) {
    if (scenes.some(x => x.id === s.client_uuid)) continue;
    scenes.push({
      id: s.client_uuid,
      name: s.name,
      icon: s.icon ?? undefined,
      position: scenes.length,
      steps: s.steps.map(st => ({ remote: st.remote, command: st.command, delayMs: st.delay_ms ?? undefined })),
    });
    added.scenes++;
  }

  const missingRemoteIds = [...new Set(remotes.filter(r => r.remoteId > 0 && !cachedRemoteIds.has(r.remoteId)).map(r => r.remoteId))];
  return { rooms, remotes, scenes, missingRemoteIds, added };
}
