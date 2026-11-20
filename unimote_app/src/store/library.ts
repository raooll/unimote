import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Remote } from '../api/types';
import { uuid } from '../lib/uuid';

export interface Room {
  id: string;
  name: string;
  icon?: string;
  position: number;
}

export interface SavedRemote {
  id: string;
  name: string;
  roomId: string | null;
  /** Catalog remote id; its full definition is cached in `catalog` for offline use. */
  remoteId: number;
  position: number;
  /** Per-device state: device IP, IR hub, last AC state, ... */
  settings: Record<string, unknown>;
}

export interface SceneStep {
  remote: string; // SavedRemote.id
  command: string;
  delayMs?: number;
}
export interface Scene {
  id: string;
  name: string;
  icon?: string;
  position: number;
  steps: SceneStep[];
}

/** A "hybrid" remote: a custom grid of buttons taken from any of the user's remotes. */
export interface PanelButton {
  remote: string; // SavedRemote.id
  command: string;
  label: string;
}
export interface Panel {
  id: string;
  name: string;
  roomId: string | null;
  position: number;
  buttons: PanelButton[];
}

export type SyncedKind = 'rooms' | 'saved_remotes' | 'scenes';
export type Tombstones = Record<SyncedKind, string[]>;
const emptyTombstones = (): Tombstones => ({ rooms: [], saved_remotes: [], scenes: [] });

interface LibraryState {
  rooms: Room[];
  panels: Panel[];
  /** Ids deleted on this phone that the server must be told about on the next sync. */
  tombstones: Tombstones;
  clearTombstones: (done: Partial<Tombstones>) => void;
  /** Replace synced collections with the result of a sync merge. */
  applySynced: (p: { rooms: Room[]; remotes: SavedRemote[]; scenes: Scene[] }) => void;
  remotes: SavedRemote[];
  scenes: Scene[];
  catalog: Record<number, Remote>;

  addRoom: (name: string, icon?: string) => Room;
  renameRoom: (id: string, name: string) => void;
  removeRoom: (id: string) => void;

  saveRemote: (remote: Remote, name: string, roomId: string | null) => SavedRemote;
  updateRemote: (id: string, patch: Partial<Pick<SavedRemote, 'name' | 'roomId' | 'settings'>>) => void;
  removeRemote: (id: string) => void;
  cacheRemote: (remote: Remote) => void;

  upsertScene: (scene: Omit<Scene, 'id' | 'position'> & { id?: string }) => Scene;
  removeScene: (id: string) => void;

  upsertPanel: (panel: Pick<Panel, 'name' | 'buttons'> & { id?: string; roomId?: string | null }) => Panel;
  removePanel: (id: string) => void;
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      rooms: [],
      panels: [],
      tombstones: emptyTombstones(),
      clearTombstones: done =>
        set(s => ({
          tombstones: {
            rooms: s.tombstones.rooms.filter(x => !done.rooms?.includes(x)),
            saved_remotes: s.tombstones.saved_remotes.filter(x => !done.saved_remotes?.includes(x)),
            scenes: s.tombstones.scenes.filter(x => !done.scenes?.includes(x)),
          },
        })),
      applySynced: ({ rooms, remotes, scenes }) => set({ rooms, remotes, scenes }),
      remotes: [],
      scenes: [],
      catalog: {},

      addRoom: (name, icon) => {
        const room: Room = { id: uuid(), name: name.trim(), icon, position: get().rooms.length };
        set(s => ({ rooms: [...s.rooms, room] }));
        return room;
      },
      renameRoom: (id, name) =>
        set(s => ({ rooms: s.rooms.map(r => (r.id === id ? { ...r, name: name.trim() } : r)) })),
      removeRoom: id =>
        set(s => ({
          rooms: s.rooms.filter(r => r.id !== id),
          remotes: s.remotes.map(r => (r.roomId === id ? { ...r, roomId: null } : r)),
          panels: s.panels.map(p => (p.roomId === id ? { ...p, roomId: null } : p)),
          tombstones: { ...s.tombstones, rooms: [...s.tombstones.rooms, id] },
        })),

      saveRemote: (remote, name, roomId) => {
        const saved: SavedRemote = {
          id: uuid(),
          name: name.trim() || remote.name,
          roomId,
          remoteId: remote.id,
          position: get().remotes.length,
          settings: {},
        };
        set(s => ({ remotes: [...s.remotes, saved], catalog: { ...s.catalog, [remote.id]: remote } }));
        return saved;
      },
      updateRemote: (id, patch) =>
        set(s => ({ remotes: s.remotes.map(r => (r.id === id ? { ...r, ...patch } : r)) })),
      removeRemote: id =>
        set(s => {
          const remotes = s.remotes.filter(r => r.id !== id);
          const used = new Set(remotes.map(r => r.remoteId));
          const catalog = Object.fromEntries(Object.entries(s.catalog).filter(([k]) => used.has(Number(k))));
          // Drop scene steps that targeted the removed remote.
          const scenes = s.scenes.map(sc => ({ ...sc, steps: sc.steps.filter(st => st.remote !== id) }));
          const panels = s.panels.map(p => ({ ...p, buttons: p.buttons.filter(b => b.remote !== id) }));
          return { remotes, catalog, scenes, panels, tombstones: { ...s.tombstones, saved_remotes: [...s.tombstones.saved_remotes, id] } };
        }),
      cacheRemote: remote => set(s => ({ catalog: { ...s.catalog, [remote.id]: remote } })),

      upsertScene: input => {
        const existing = input.id ? get().scenes.find(s => s.id === input.id) : undefined;
        const scene: Scene = {
          id: existing?.id ?? uuid(),
          name: input.name.trim(),
          icon: input.icon,
          steps: input.steps,
          position: existing?.position ?? get().scenes.length,
        };
        set(s => ({
          scenes: existing ? s.scenes.map(x => (x.id === scene.id ? scene : x)) : [...s.scenes, scene],
        }));
        return scene;
      },
      removeScene: id =>
        set(s => ({ scenes: s.scenes.filter(x => x.id !== id), tombstones: { ...s.tombstones, scenes: [...s.tombstones.scenes, id] } })),

      upsertPanel: input => {
        const existing = input.id ? get().panels.find(p => p.id === input.id) : undefined;
        const panel: Panel = {
          id: existing?.id ?? uuid(),
          name: input.name.trim(),
          roomId: input.roomId ?? existing?.roomId ?? null,
          buttons: input.buttons,
          position: existing?.position ?? get().panels.length,
        };
        set(s => ({ panels: existing ? s.panels.map(x => (x.id === panel.id ? panel : x)) : [...s.panels, panel] }));
        return panel;
      },
      removePanel: id => set(s => ({ panels: s.panels.filter(x => x.id !== id) })),
    }),
    { name: 'unimote.library', storage: createJSONStorage(() => AsyncStorage), version: 2, migrate: (state: unknown) => ({ panels: [], tombstones: emptyTombstones(), ...(state as object) }) as never },
  ),
);
