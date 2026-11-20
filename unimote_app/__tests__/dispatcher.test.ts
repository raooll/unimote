import { sendCommand } from '../src/transport/dispatcher';
import { UnimoteIr } from '../src/native/UnimoteIr';
import { irRemote, wifiRemote } from '../__fixtures__/remotes';

jest.mock('../src/native/UnimoteIr', () => ({
  UnimoteIr: { available: true, hasIrEmitter: jest.fn(), transmit: jest.fn() },
}));
const ir = UnimoteIr as unknown as { hasIrEmitter: jest.Mock; transmit: jest.Mock };

describe('transport dispatcher', () => {
  beforeEach(() => {
    ir.hasIrEmitter.mockReset().mockResolvedValue(true);
    ir.transmit.mockReset().mockResolvedValue(undefined);
  });

  it('sends the raw IR pattern for a known button', async () => {
    const res = await sendCommand(irRemote, 'POWER');
    expect(res).toEqual({ ok: true });
    expect(ir.transmit).toHaveBeenCalledWith(38000, [9000, 4500, 560, 560, 560]);
  });

  it('reports an unknown button without transmitting', async () => {
    const res = await sendCommand(irRemote, 'HDMI_9');
    expect(res).toMatchObject({ ok: false, code: 'unknown_command' });
    expect(ir.transmit).not.toHaveBeenCalled();
  });

  it('explains when the phone has no IR blaster', async () => {
    ir.hasIrEmitter.mockResolvedValue(false);
    const res = await sendCommand(irRemote, 'POWER');
    expect(res).toMatchObject({ ok: false, code: 'no_ir_emitter' });
    expect(ir.transmit).not.toHaveBeenCalled();
  });

  it('surfaces native transmit errors instead of throwing', async () => {
    ir.transmit.mockRejectedValue(new Error('boom'));
    expect(await sendCommand(irRemote, 'POWER')).toEqual({ ok: false, code: 'error', message: 'boom' });
  });

  it('says so for protocols without a driver', async () => {
    expect(await sendCommand({ ...wifiRemote, protocol: 'zigbee' as never }, 'POWER')).toMatchObject({ ok: false, code: 'unsupported' });
  });

  it('asks a Wi-Fi remote to be connected before it can send', async () => {
    expect(await sendCommand(wifiRemote, 'POWER')).toMatchObject({ ok: false, code: 'needs_setup' });
  });
});
