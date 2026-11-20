import type { Remote } from '../src/api/types';
import { decodeBroadlink } from '../src/lib/broadlink';
import { commandList } from '../src/lib/commands';
import { acMeta, commandFor, fit, hasState, initialState, isAcRemote, norm, stateKey, stepTemp, type AcMeta } from '../src/lib/acState';
import { sendCommand } from '../src/transport/dispatcher';
import { UnimoteIr } from '../src/native/UnimoteIr';

jest.mock('../src/native/UnimoteIr', () => ({
  UnimoteIr: { available: true, hasIrEmitter: jest.fn(), transmit: jest.fn() },
}));
const ir = UnimoteIr as unknown as { hasIrEmitter: jest.Mock; transmit: jest.Mock };

// A real SmartIR "off" packet; the server (Ruby) decodes it to 140 durations starting 9045, 4416, 700, 1584.
const REAL_OFF =
  'JgCSAAABKZEXNBgQFxEXEBc1FxAYEBcQGDQXERcQGDQXERcQFxEXEBcRFxAYEBcQGBAXNRcQFxEXEBcRFxAYEBc1FxAXNRcQGBAXNRcQFwACjhcQGBAXEBgQFxEXEBcRFxAXERcQGBAXEBgQFzQYEBcRFxAYEBcQGBAXEBgQFxEXEBcRFxAXERcQGBAXNBg0FxEXAA0FAAAAAAAA';
// Ruby: Catalog::Broadlink.encode([9000, 4500, 560, 560, 560, 1690, 560, 20000])
const ENCODED = 'JgAMAAABKJQSEhI3EgACkQ==';

const meta: AcMeta = {
  min_temp: 16, max_temp: 30, step: 1,
  modes: {
    cool: { fans: ['auto', 'low'], swings: ['off'], temps: ['23', '24', '25'] },
    fan_only: { fans: ['low'] },
  },
};
const remote = (commands: Record<string, unknown>): Remote => ({
  id: 1, name: 'AC', brand: { slug: 'x', name: 'X' }, model: { id: 1, slug: 'm', name: 'M' }, category: 'ac', protocol: 'ir',
  variant: 'v', layout_template: 'ac_state', layout: { name: 'ac', sections: [{ id: 'ac', type: 'ac_state' }] }, version: 1, checksum: 'c',
  updated_at: '', signal_data: { commands, ac: meta as never },
});

describe('decodeBroadlink', () => {
  it('matches the server decoder on a real SmartIR packet', () => {
    const s = decodeBroadlink(REAL_OFF)!;
    expect(s.frequency).toBe(38000);
    expect(s.pattern.length).toBe(140);
    expect(s.pattern.slice(0, 4)).toEqual([9045, 4416, 700, 1584]);
    expect(s.pattern[s.pattern.length - 1]).toBe(101502); // the final 00 0d 05 gap
  });

  it('decodes the server encoder output (3-byte ticks) within a tick', () => {
    const p = decodeBroadlink(ENCODED)!.pattern;
    [9000, 4500, 560, 560, 560, 1690, 560, 20000].forEach((us, i) => expect(Math.abs(p[i] - us)).toBeLessThan(31));
  });

  it('rejects junk and truncated packets', () => {
    expect(decodeBroadlink('')).toBeNull();
    expect(decodeBroadlink('AAAAAA==')).toBeNull();
    expect(decodeBroadlink('JgAMAAABKJQSEhI3EgAC')).toBeNull(); // cut mid 3-byte tick count
  });
});

describe('AC state', () => {
  it('normalises keys like the importer', () => {
    expect(norm('heat_cool')).toBe('HEAT_COOL');
    expect(stateKey({ mode: 'cool', fan: 'auto', temp: '24' })).toBe('COOL_AUTO_24');
    expect(stateKey({ mode: 'cool', fan: 'low', swing: 'off', temp: '22.5' })).toBe('COOL_LOW_OFF_22_5');
    expect(stateKey({ mode: 'fan_only', fan: 'low' })).toBe('FAN_ONLY_LOW');
  });

  it('starts on cool, auto fan, 24 and is off', () => {
    expect(initialState(meta)).toEqual({ on: false, mode: 'cool', fan: 'auto', swing: 'off', temp: '24' });
  });

  it('fits a state to what the mode offers (nearest temperature, no fan temperature in fan_only)', () => {
    expect(fit(meta, { on: true, mode: 'cool', fan: 'auto', temp: '30' }).temp).toBe('25');
    expect(fit(meta, { on: true, mode: 'cool', fan: 'auto', temp: '20' }).temp).toBe('23');
    expect(fit(meta, { on: true, mode: 'fan_only', fan: 'auto', temp: '24' })).toEqual({ on: true, mode: 'fan_only', fan: 'low', swing: undefined, temp: undefined });
    expect(fit(meta, { on: true, mode: 'nope', fan: 'low', temp: '24' }).mode).toBe('cool');
  });

  it('steps temperature within range and stops at the ends', () => {
    const s = { on: true, mode: 'cool', fan: 'auto', temp: '24' };
    expect(stepTemp(meta, s, 1)).toBe('25');
    expect(stepTemp(meta, s, -1)).toBe('23');
    expect(stepTemp(meta, { ...s, temp: '25' }, 1)).toBeNull();
    expect(stepTemp(meta, { ...s, mode: 'fan_only', temp: undefined }, 1)).toBeNull();
  });

  it('sends OFF when off and the table key when on', () => {
    const r = remote({ OFF: { broadlink: ENCODED }, COOL_AUTO_24: { broadlink: ENCODED } });
    expect(commandFor(r, { on: false, mode: 'cool', fan: 'auto', temp: '24' })).toBe('OFF');
    expect(commandFor(r, { on: true, mode: 'cool', fan: 'auto', temp: '24' })).toBe('COOL_AUTO_24');
    expect(hasState(r, { on: true, mode: 'cool', fan: 'auto', temp: '24' })).toBe(true);
    expect(hasState(r, { on: true, mode: 'cool', fan: 'low', temp: '24' })).toBe(false);
    expect(isAcRemote(r)).toBe(true);
    expect(acMeta(r)?.min_temp).toBe(16);
  });

  it('lists Off plus one preset per mode for scenes, not every combination', () => {
    const r = remote({ OFF: { broadlink: ENCODED }, COOL_AUTO_OFF_24: { broadlink: ENCODED }, COOL_AUTO_OFF_25: { broadlink: ENCODED }, FAN_ONLY_LOW: { broadlink: ENCODED } });
    expect(commandList(r).map(c => c.key)).toEqual(['OFF', 'COOL_AUTO_OFF_24', 'FAN_ONLY_LOW']);
  });
});

describe('sending an AC state', () => {
  it('decodes the compact packet before handing it to the IR driver', async () => {
    ir.hasIrEmitter.mockResolvedValue(true);
    ir.transmit.mockResolvedValue(undefined);
    const res = await sendCommand(remote({ COOL_AUTO_24: { broadlink: ENCODED } }), 'COOL_AUTO_24');
    expect(res).toEqual({ ok: true });
    expect(ir.transmit.mock.calls[0][0]).toBe(38000);
    expect(ir.transmit.mock.calls[0][1]).toHaveLength(8);
  });

  it('still reports a missing state as an unknown button', async () => {
    const res = await sendCommand(remote({ COOL_AUTO_24: { broadlink: ENCODED } }), 'COOL_LOW_24');
    expect(res).toMatchObject({ ok: false, code: 'unknown_command' });
  });
});
