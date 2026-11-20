import { useLibrary } from '../src/store/library';
import { irRemote } from '../__fixtures__/remotes';

const reset = () => useLibrary.setState({ rooms: [], remotes: [], scenes: [], catalog: {} });

describe('library store', () => {
  beforeEach(reset);

  it('saves a remote, caches its definition for offline use and assigns a room', () => {
    const room = useLibrary.getState().addRoom('  Living Room ');
    const saved = useLibrary.getState().saveRemote(irRemote, 'TV', room.id);
    const s = useLibrary.getState();
    expect(room.name).toBe('Living Room');
    expect(saved).toMatchObject({ name: 'TV', roomId: room.id, remoteId: 42 });
    expect(s.catalog[42].signal_data.commands.POWER).toBeDefined();
  });

  it('falls back to the catalog name when the name is blank', () => {
    expect(useLibrary.getState().saveRemote(irRemote, '   ', null).name).toBe('Samsung AA59-00443A');
  });

  it('unassigns remotes when their room is deleted', () => {
    const room = useLibrary.getState().addRoom('Bedroom');
    const saved = useLibrary.getState().saveRemote(irRemote, 'AC', room.id);
    useLibrary.getState().removeRoom(room.id);
    expect(useLibrary.getState().remotes.find(r => r.id === saved.id)?.roomId).toBeNull();
  });

  it('drops the cached definition only when no saved remote uses it, and prunes scene steps', () => {
    const a = useLibrary.getState().saveRemote(irRemote, 'A', null);
    const b = useLibrary.getState().saveRemote(irRemote, 'B', null);
    useLibrary.getState().upsertScene({ name: 'Movie', steps: [{ remote: a.id, command: 'POWER' }, { remote: b.id, command: 'POWER' }] });

    useLibrary.getState().removeRemote(a.id);
    expect(useLibrary.getState().catalog[42]).toBeDefined(); // b still uses it
    expect(useLibrary.getState().scenes[0].steps).toEqual([{ remote: b.id, command: 'POWER' }]);

    useLibrary.getState().removeRemote(b.id);
    expect(useLibrary.getState().catalog[42]).toBeUndefined();
  });

  it('upserts scenes by id', () => {
    const sc = useLibrary.getState().upsertScene({ name: 'Night', steps: [] });
    useLibrary.getState().upsertScene({ id: sc.id, name: 'Night mode', steps: [{ remote: 'x', command: 'POWER' }] });
    const scenes = useLibrary.getState().scenes;
    expect(scenes).toHaveLength(1);
    expect(scenes[0]).toMatchObject({ name: 'Night mode', position: 0 });
  });
});

describe('panels and rooms cascade', () => {
  it('drops panel buttons of a deleted remote and unassigns panels of a deleted room', () => {
    const { irRemote } = jest.requireActual('../__fixtures__/remotes');
    const lib = useLibrary.getState();
    const room = lib.addRoom('Den');
    const saved = lib.saveRemote(irRemote, 'TV', room.id);
    lib.upsertPanel({ name: 'Mix', roomId: room.id, buttons: [{ remote: saved.id, command: 'POWER', label: 'Power' }] });
    useLibrary.getState().removeRoom(room.id);
    expect(useLibrary.getState().panels[0].roomId).toBeNull();
    useLibrary.getState().removeRemote(saved.id);
    expect(useLibrary.getState().panels[0].buttons).toEqual([]);
  });
});
