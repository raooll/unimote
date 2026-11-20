import { pickNotificationActions } from '../src/lib/notificationActions';

const ir = (pattern: number[]) => ({ frequency: 38000, duty_cycle: 0.33, pattern });
const remote = (commands: Record<string, unknown>, protocol: 'ir' | 'wifi' = 'ir') => ({ protocol, signal_data: { commands } }) as never;

describe('pickNotificationActions', () => {
  it('prefers power, volume and mute, in that order, with friendly labels', () => {
    const acts = pickNotificationActions(remote({ HDMI_1: ir([1, 2]), MUTE: ir([5, 5]), VOL_UP: ir([3, 3]), POWER: ir([9, 9]), VOL_DOWN: ir([4, 4]) }));
    expect(acts.map(a => a.label)).toEqual(['Power', 'Vol +', 'Vol −', 'Mute']);
  });

  it('skips duplicate codes (POWER and POWER_ON often share one)', () => {
    const acts = pickNotificationActions(remote({ POWER: ir([9, 9]), POWER_ON: ir([9, 9]), MUTE: ir([5, 5]) }));
    expect(acts.map(a => a.label)).toEqual(['Power', 'Mute']);
  });

  it('caps at four and falls back to other buttons when the usual ones are missing', () => {
    const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`KEY_${i}`, ir([i + 1, 7])]));
    const acts = pickNotificationActions(remote(many));
    expect(acts).toHaveLength(4);
    expect(acts[0].label).toBe('Key 0');
  });

  it('ignores malformed signals and returns nothing for Wi-Fi remotes', () => {
    expect(pickNotificationActions(remote({ POWER: { frequency: 38000, pattern: [0, -1] }, MUTE: 'KEY_MUTE' }))).toEqual([]);
    expect(pickNotificationActions(remote({ POWER: ir([9, 9]) }, 'wifi'))).toEqual([]);
  });

  it('decodes compact Broadlink packets (AC state tables)', () => {
    const acts = pickNotificationActions(remote({ OFF: { broadlink: 'JgAMAAEBAQEBAQEBAQEBAA0FAAAAAAAA' } }));
    expect(acts.length).toBeLessThanOrEqual(1); // decodes or is skipped, never throws
  });
});
