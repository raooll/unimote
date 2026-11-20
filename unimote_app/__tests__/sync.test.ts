import type { SyncSnapshot } from '../src/api/types';
import { buildPayload, mergeSnapshot, stripSecrets } from '../src/sync/merge';
import { syncNow } from '../src/sync/sync';
import { useAuth } from '../src/store/auth';
import { useLibrary } from '../src/store/library';
import { irRemote } from '../__fixtures__/remotes';

jest.mock('../src/api/client', () => ({ api: {} }));

const snap = (over: Partial<SyncSnapshot> = {}): SyncSnapshot => ({ rooms: [], saved_remotes: [], scenes: [], server_time: 'x', ...over });
const reset = () => {
  useLibrary.setState({ rooms: [], remotes: [], scenes: [], panels: [], catalog: {}, tombstones: { rooms: [], saved_remotes: [], scenes: [] } });
  useAuth.setState({ token: 'T', user: null });
};

describe('sync merge', () => {
  it('never uploads pairing secrets and skips phone-only remotes', () => {
    expect(stripSecrets({ host: '1.1.1.1', token: 'a', clientKey: 'b', hub: {} })).toEqual({ host: '1.1.1.1', hub: {} });
    const payload = buildPayload({
      rooms: [],
      scenes: [{ id: 's', name: 'S', position: 0, steps: [{ remote: 'cloud', command: 'A' }, { remote: 'mine', command: 'B' }] }],
      remotes: [
        { id: 'cloud', name: 'TV', roomId: null, remoteId: 5, position: 0, settings: { host: 'h', token: 'secret' } },
        { id: 'mine', name: 'Recorded', roomId: null, remoteId: -1, position: 1, settings: {} },
      ],
    });
    expect(payload.saved_remotes).toHaveLength(1);
    expect(payload.saved_remotes[0].settings).toEqual({ host: 'h' });
    expect(payload.scenes[0].steps.map(s => s.command)).toEqual(['A']);
  });

  it('adds server-only items, keeps the phone’s copy of shared ones, and lists uncached remotes', () => {
    const local = {
      rooms: [{ id: 'r1', name: 'Local name', position: 0 }],
      remotes: [{ id: 'a', name: 'Local TV', roomId: 'r1', remoteId: 5, position: 0, settings: {} }],
      scenes: [],
    };
    const m = mergeSnapshot(
      local,
      snap({
        rooms: [{ client_uuid: 'r1', name: 'Server name', position: 0 }, { client_uuid: 'r2', name: 'Den', position: 1 }],
        saved_remotes: [
          { client_uuid: 'a', name: 'Server TV', position: 0, remote_config_id: 5, room_client_uuid: 'r1' },
          { client_uuid: 'b', name: 'Bedroom TV', position: 1, remote_config_id: 9, room_client_uuid: 'r2', settings: { host: 'x' } },
        ],
        scenes: [{ client_uuid: 's', name: 'Night', position: 0, steps: [{ remote: 'b', command: 'POWER', delay_ms: 500 }] }],
      }),
      new Set([5]),
    );
    expect(m.rooms.map(r => r.name)).toEqual(['Local name', 'Den']);
    expect(m.remotes.map(r => r.name)).toEqual(['Local TV', 'Bedroom TV']);
    expect(m.remotes[1]).toMatchObject({ roomId: 'r2', settings: { host: 'x' } });
    expect(m.scenes[0].steps).toEqual([{ remote: 'b', command: 'POWER', delayMs: 500 }]);
    expect(m.missingRemoteIds).toEqual([9]);
    expect(m.added).toEqual({ rooms: 1, remotes: 1, scenes: 1 });
  });
});

describe('syncNow', () => {
  beforeEach(reset);

  it('flushes deletions first, then pushes, then pulls and caches missing remotes', async () => {
    const lib = useLibrary.getState();
    const saved = lib.saveRemote(irRemote, 'TV', null);
    useLibrary.getState().removeRemote(saved.id);
    const calls: string[] = [];
    const api = {
      deleteSynced: jest.fn(async (k: string, id: string) => void calls.push(`del:${k}:${id === saved.id}`)),
      sync: jest.fn(async () => {
        calls.push('sync');
        return snap({ saved_remotes: [{ client_uuid: 'new', name: 'Cloud TV', position: 0, remote_config_id: 42 }] });
      }),
      remote: jest.fn(async () => irRemote),
    };
    const r = await syncNow(api as never);
    expect(calls).toEqual(['del:saved_remotes:true', 'sync']);
    expect(r).toEqual({ added: { rooms: 0, remotes: 1, scenes: 0 }, deleted: 1 });
    expect(useLibrary.getState().remotes.map(x => x.name)).toEqual(['Cloud TV']);
    expect(useLibrary.getState().catalog[irRemote.id]).toBeDefined();
    expect(useLibrary.getState().tombstones.saved_remotes).toEqual([]);
  });

  it('does not resurrect something deleted while the request was in flight', async () => {
    const saved = useLibrary.getState().saveRemote(irRemote, 'TV', null);
    const api = {
      deleteSynced: jest.fn(),
      sync: jest.fn(async () => {
        useLibrary.getState().removeRemote(saved.id); // user deletes mid-sync
        return snap({ saved_remotes: [{ client_uuid: saved.id, name: 'TV', position: 0, remote_config_id: irRemote.id }] });
      }),
      remote: jest.fn(),
    };
    await syncNow(api as never);
    expect(useLibrary.getState().remotes).toEqual([]);
    expect(useLibrary.getState().tombstones.saved_remotes).toEqual([saved.id]); // still pending for the next run
  });

  it('keeps tombstones when the server is unreachable, and refuses without a login', async () => {
    const saved = useLibrary.getState().saveRemote(irRemote, 'TV', null);
    useLibrary.getState().removeRemote(saved.id);
    const api = { deleteSynced: jest.fn().mockRejectedValue(new Error('offline')), sync: jest.fn(), remote: jest.fn() };
    await expect(syncNow(api as never)).rejects.toThrow('offline');
    expect(useLibrary.getState().tombstones.saved_remotes).toEqual([saved.id]);
    useAuth.setState({ token: null });
    await expect(syncNow(api as never)).rejects.toThrow('Sign in');
  });
});

import { buildRecordedRemote, buildSubmission, isRecordedRemote } from '../src/learn/recorded';

describe('recorded remotes', () => {
  const input = { brand: ' Acme ', model: 'X1', category: 'tv', signals: { POWER: [9000, 4500, 560, 560], VOL_UP: [560, 560] } };

  it('builds a phone-only IR remote that the renderer and drivers can use', () => {
    const r = buildRecordedRemote(input, -5);
    expect(isRecordedRemote(r)).toBe(true);
    expect(r).toMatchObject({ name: 'Acme X1', protocol: 'ir', layout: null });
    expect(r.signal_data.commands.POWER).toEqual({ frequency: 38000, duty_cycle: 0.33, pattern: [9000, 4500, 560, 560] });
    expect(r.signal_data.labels).toEqual({ POWER: 'Power', VOL_UP: 'Vol up' });
  });

  it('builds a submission matching the server’s schema, without private data', () => {
    const s = buildSubmission(input, 'works');
    expect(s).toMatchObject({ brand_name: 'Acme', model_name: 'X1', category: 'tv', protocol: 'ir', notes: 'works' });
    expect(Object.keys(s)).toEqual(['brand_name', 'model_name', 'category', 'protocol', 'notes', 'signal_data']);
    expect(s.signal_data.commands.VOL_UP).toMatchObject({ frequency: 38000, pattern: [560, 560] });
  });

  it('never syncs a recorded remote', () => {
    const lib = { rooms: [], scenes: [], remotes: [{ id: 'm', name: 'Mine', roomId: null, remoteId: -5, position: 0, settings: {} }] };
    expect(buildPayload(lib).saved_remotes).toEqual([]);
  });
});
