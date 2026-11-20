import { parseRokuInfo, parseSamsungInfo, parseUpnpInfo, scanNetwork } from '../src/transport/nearby';

const rokuXml = '<device-info><user-device-name>Living room</user-device-name><model-name>Ultra</model-name><is-tv>false</is-tv></device-info>';

describe('network scan parsing', () => {
  it('reads a Roku player and a Roku TV', () => {
    expect(parseRokuInfo(rokuXml)).toEqual({ name: 'Living room', model: 'Ultra', isTv: false });
    expect(parseRokuInfo('<device-info><is-tv>true</is-tv></device-info>').isTv).toBe(true);
  });
  it('reads Samsung and UPnP descriptions and survives garbage', () => {
    expect(parseSamsungInfo('{"device":{"name":"[TV] Samsung 7","modelName":"UE55"}}')).toEqual({ name: '[TV] Samsung 7', model: 'UE55' });
    expect(parseSamsungInfo('not json')).toEqual({});
    expect(parseUpnpInfo('<root><friendlyName>LG OLED</friendlyName><modelName>OLED55</modelName></root>')).toEqual({ name: 'LG OLED', model: 'OLED55' });
  });
});

describe('scanNetwork: Android TV', () => {
  it('lists Android TVs found over mDNS next to the others, once each', async () => {
    const scan = await scanNetwork({
      ssdp: (async () => []) as never,
      http: (async () => ({ status: 200, body: '' })) as never,
      hubs: async () => [],
      atv: async () => [{ ip: '10.0.0.7', name: 'Bedroom TV', port: 6466 }, { ip: '10.0.0.7', name: 'Bedroom TV', port: 6466 }],
    });
    expect(scan.devices).toEqual([{ ip: '10.0.0.7', kind: 'androidtv', name: 'Bedroom TV', detail: 'Android TV / Google TV', category: 'tv', brand: 'android-tv' }]);
  });
  it('survives a failing mDNS search', async () => {
    const scan = await scanNetwork({ ssdp: (async () => []) as never, hubs: async () => [], atv: async () => { throw new Error('nsd'); } });
    expect(scan.devices).toEqual([]);
  });
});

describe('scanNetwork', () => {
  it('lists each device once, names it, and keeps going when a search or lookup fails', async () => {
    const ssdp = jest.fn(async (st: string) => {
      if (st === 'roku:ecp') return [{ ip: '10.0.0.5' }, { ip: '10.0.0.5' }];
      if (st.includes('samsung')) throw new Error('socket error');
      return [{ ip: '10.0.0.9', location: 'http://10.0.0.9:1/d.xml' }];
    });
    const http = jest.fn(async (_m: string, url: string) => {
      if (url.includes(':8060')) return { status: 200, body: rokuXml };
      throw new Error('timeout');
    });
    const scan = await scanNetwork({ ssdp: ssdp as never, http: http as never, hubs: async () => [] });
    expect(scan.devices).toEqual([
      { ip: '10.0.0.5', kind: 'roku', name: 'Living room', detail: 'Ultra', category: 'streaming', brand: 'roku' },
      { ip: '10.0.0.9', kind: 'lg', name: 'LG TV', detail: undefined, category: 'tv', brand: 'lg' },
    ]);
  });
  it('returns nothing, not an error, when the network is silent', async () => {
    const scan = await scanNetwork({ ssdp: (async () => []) as never, http: (async () => ({ status: 200, body: '' })) as never, hubs: async () => { throw new Error('x'); } });
    expect(scan).toEqual({ devices: [], hubs: [] });
  });
});

import { scanBluetooth } from '../src/transport/nearby';

describe('scanBluetooth', () => {
  it('lists paired devices with an address', async () => {
    const r = await scanBluetooth({ permission: async () => true, bonded: async () => [{ name: 'Living Room TV', address: 'AA:BB' }, { name: 'ghost', address: '' }] });
    expect(r).toEqual({ devices: [{ name: 'Living Room TV', address: 'AA:BB' }], denied: false });
  });
  it('reports a refused permission instead of an empty list', async () => {
    expect(await scanBluetooth({ permission: async () => false, bonded: async () => [{ name: 'x', address: 'y' }] })).toEqual({ devices: [], denied: true });
  });
  it('never throws', async () => {
    expect(await scanBluetooth({ permission: async () => true, bonded: async () => { throw new Error('no bluetooth'); } })).toEqual({ devices: [], denied: false });
  });
});
