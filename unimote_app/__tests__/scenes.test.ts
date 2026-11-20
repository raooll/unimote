import { describeFailures, runScene } from '../src/scenes/engine';
import type { SavedRemote } from '../src/store/library';
import { irRemote, wifiRemote } from '../__fixtures__/remotes';

const remotes: SavedRemote[] = [
  { id: 'tv', name: 'TV', roomId: null, remoteId: irRemote.id, position: 0, settings: {} },
  { id: 'roku', name: 'Roku', roomId: null, remoteId: wifiRemote.id, position: 1, settings: { host: '1.2.3.4' } },
];
const catalog = { [irRemote.id]: irRemote, [wifiRemote.id]: wifiRemote };

const deps = (send: jest.Mock, extra = {}) => ({ remotes, catalog, send, sleep: jest.fn().mockResolvedValue(undefined), ...extra });

describe('scene engine', () => {
  it('runs steps in order with each remote’s own settings', async () => {
    const send = jest.fn().mockResolvedValue({ ok: true });
    const r = await runScene({ steps: [{ remote: 'tv', command: 'POWER' }, { remote: 'roku', command: 'HOME' }] }, deps(send));
    expect(r).toEqual({ ran: 2, failures: [], cancelled: false });
    expect(send.mock.calls.map(c => [c[0].id, c[1]])).toEqual([[irRemote.id, 'POWER'], [wifiRemote.id, 'HOME']]);
    expect(send.mock.calls[1][2].settings).toEqual({ host: '1.2.3.4' });
  });

  it('keeps going after a failure and reports it', async () => {
    const send = jest.fn().mockResolvedValueOnce({ ok: false, code: 'unreachable', message: 'nope' }).mockResolvedValueOnce({ ok: true });
    const r = await runScene({ steps: [{ remote: 'tv', command: 'POWER' }, { remote: 'roku', command: 'HOME' }] }, deps(send));
    expect(r.ran).toBe(2);
    expect(r.failures).toEqual([{ index: 0, remoteName: 'TV', command: 'POWER', message: 'nope' }]);
    expect(describeFailures(r)).toBe('TV: nope');
  });

  it('flags steps whose remote was deleted without sending', async () => {
    const send = jest.fn();
    const r = await runScene({ steps: [{ remote: 'gone', command: 'POWER' }] }, deps(send));
    expect(send).not.toHaveBeenCalled();
    expect(r.failures[0].message).toMatch(/no longer/);
  });

  it('waits the step delay plus a gap, capped, and not after the last step', async () => {
    const send = jest.fn().mockResolvedValue({ ok: true });
    const d = deps(send);
    await runScene({ steps: [{ remote: 'tv', command: 'POWER', delayMs: 2000 }, { remote: 'tv', command: 'MUTE', delayMs: 999_999 }, { remote: 'tv', command: 'POWER' }] }, d);
    expect(d.sleep.mock.calls.map(c => c[0])).toEqual([2350, 30350]);
  });

  it('can be cancelled between steps and reports progress', async () => {
    const send = jest.fn().mockResolvedValue({ ok: true });
    let calls = 0;
    const onStep = jest.fn();
    const r = await runScene({ steps: [{ remote: 'tv', command: 'A' }, { remote: 'tv', command: 'B' }, { remote: 'tv', command: 'C' }] }, deps(send, { onStep, shouldCancel: () => calls++ >= 1 }));
    expect(r).toMatchObject({ ran: 1, cancelled: true });
    expect(onStep).toHaveBeenCalledWith(1, 3);
  });
});
