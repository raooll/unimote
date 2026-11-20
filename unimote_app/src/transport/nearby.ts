import { UnimoteHub, type HubDevice } from '../native/UnimoteHub';
import { UnimoteHid, ensureBluetoothPermission, type BondedDevice } from '../native/UnimoteHid';
import { UnimoteAtv, type AtvDevice } from '../native/UnimoteAtv';
import { UnimoteLan, type SsdpDevice } from '../native/UnimoteLan';

export type NearbyKind = 'roku' | 'samsung' | 'lg' | 'androidtv';

export interface NearbyDevice {
  ip: string;
  kind: NearbyKind;
  /** Friendly name when the device told us one, else its brand. */
  name: string;
  /** Model / extra line shown under the name. */
  detail?: string;
  /** Catalog category + brand used to find the matching Wi-Fi profile. */
  category: string;
  brand: string;
}

export interface NearbyScan {
  devices: NearbyDevice[];
  hubs: HubDevice[];
}

/** SSDP search targets: the same ones the catalog's Wi-Fi profiles advertise. */
export const SEARCHES: { kind: NearbyKind; st: string }[] = [
  { kind: 'roku', st: 'roku:ecp' },
  { kind: 'samsung', st: 'urn:samsung.com:device:RemoteControlReceiver:1' },
  { kind: 'lg', st: 'urn:lge-com:service:webos-second-screen:1' },
];

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim() || undefined;

/** Roku `GET :8060/query/device-info` (XML). */
export function parseRokuInfo(xml: string): { name?: string; model?: string; isTv: boolean } {
  return {
    name: tag(xml, 'user-device-name') ?? tag(xml, 'friendly-device-name') ?? tag(xml, 'friendly-model-name'),
    model: tag(xml, 'model-name'),
    isTv: tag(xml, 'is-tv') === 'true',
  };
}

/** Samsung `GET :8001/api/v2/` (JSON). */
export function parseSamsungInfo(body: string): { name?: string; model?: string } {
  try {
    const d = JSON.parse(body)?.device ?? {};
    return { name: typeof d.name === 'string' ? d.name : undefined, model: typeof d.modelName === 'string' ? d.modelName : undefined };
  } catch {
    return {};
  }
}

/** LG and others describe themselves in the SSDP description XML. */
export function parseUpnpInfo(xml: string): { name?: string; model?: string } {
  return { name: tag(xml, 'friendlyName'), model: tag(xml, 'modelName') };
}

type Http = typeof UnimoteLan.http;

async function describe(kind: NearbyKind, d: SsdpDevice, http: Http): Promise<NearbyDevice> {
  const base = { ip: d.ip, kind };
  const get = async (url: string) => {
    try {
      const r = await http('GET', url, { timeoutMs: 1500 });
      return r.status >= 200 && r.status < 300 ? r.body : '';
    } catch {
      return '';
    }
  };
  if (kind === 'roku') {
    const info = parseRokuInfo(await get(`http://${d.ip}:8060/query/device-info`));
    return { ...base, name: info.name ?? 'Roku', detail: info.model, category: info.isTv ? 'tv' : 'streaming', brand: 'roku' };
  }
  if (kind === 'samsung') {
    const info = parseSamsungInfo(await get(`http://${d.ip}:8001/api/v2/`));
    return { ...base, name: info.name ?? 'Samsung TV', detail: info.model, category: 'tv', brand: 'samsung' };
  }
  const info = d.location ? parseUpnpInfo(await get(d.location)) : {};
  return { ...base, name: info.name ?? 'LG TV', detail: info.model, category: 'tv', brand: 'lg' };
}

/** Looks for controllable devices on the Wi-Fi network the phone is on. Never throws; a failed search just finds nothing. */
export async function scanNetwork(
  deps: { ssdp?: typeof UnimoteLan.ssdpSearch; http?: Http; hubs?: () => Promise<HubDevice[]>; atv?: () => Promise<AtvDevice[]> } = {},
): Promise<NearbyScan> {
  const ssdp = deps.ssdp ?? UnimoteLan.ssdpSearch;
  const http = deps.http ?? UnimoteLan.http;
  const [searches, hubs, atvTvs] = await Promise.all([
    Promise.all(SEARCHES.map(async s => ({ kind: s.kind, found: await ssdp(s.st).catch(() => [] as SsdpDevice[]) }))),
    (deps.hubs ?? (() => UnimoteHub.discover()))().catch(() => [] as HubDevice[]),
    (deps.atv ?? (() => UnimoteAtv.discover()))().catch(() => [] as AtvDevice[]),
  ]);
  const seen = new Set<string>();
  const pending: Promise<NearbyDevice>[] = [];
  for (const { kind, found } of searches) {
    for (const d of found) {
      const key = `${kind}:${d.ip}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pending.push(describe(kind, d, http));
    }
  }
  // Android TV / Google TV announce themselves over mDNS rather than SSDP.
  const tvs: NearbyDevice[] = [];
  for (const tv of atvTvs) {
    const key = `androidtv:${tv.ip}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tvs.push({ ip: tv.ip, kind: 'androidtv', name: tv.name || 'Android TV', detail: 'Android TV / Google TV', category: 'tv', brand: 'android-tv' });
  }
  return { devices: [...(await Promise.all(pending)), ...tvs], hubs };
}

export interface BluetoothScan {
  devices: BondedDevice[];
  /** The user refused the Bluetooth permission, so nothing could be listed. */
  denied: boolean;
}

/**
 * Bluetooth devices already paired in Android Settings (Android TV, Fire TV, PCs, ...). Unimote can act as a
 * Bluetooth remote (HID) for them. Never throws.
 */
export async function scanBluetooth(
  deps: { permission?: () => Promise<boolean>; bonded?: () => Promise<BondedDevice[]> } = {},
): Promise<BluetoothScan> {
  try {
    if (!(await (deps.permission ?? ensureBluetoothPermission)())) return { devices: [], denied: true };
    const devices = await (deps.bonded ?? UnimoteHid.bondedDevices)();
    return { devices: devices.filter(d => d.address), denied: false };
  } catch {
    return { devices: [], denied: false };
  }
}
