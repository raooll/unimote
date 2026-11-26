import { type AppShortcut, platformOf } from '../lib/appShortcuts';
import { decodeBroadlink } from '../lib/broadlink';
import type { Remote } from '../api/types';
import type { SsdpDevice } from '../native/UnimoteLan';
import { UnimoteLan } from '../native/UnimoteLan';
import { ensureBluetoothPermission, UnimoteHid } from '../native/UnimoteHid';
import { createBleDriver, scanLights } from './ble';
import { createBtHidDriver } from './btHid';
import { irDriver } from './irDriver';
import { decodeHubId, encodeHubId, hubFromSettings, sendViaHub } from './irHub';
import { UnimoteHub } from '../native/UnimoteHub';
import { AskCode, Driver, fail, PairResult, SendContext, SendResult } from './types';
import { createLgDriver } from './wifi/lg';
import { createRokuDriver } from './wifi/roku';
import { createSamsungDriver } from './wifi/samsung';
import { createAndroidTvDriver } from './wifi/androidtv';
import { UnimoteAtv } from '../native/UnimoteAtv';

// The IR-hub driver is appended here once built.
const drivers: Driver[] = [irDriver, createRokuDriver(), createSamsungDriver(), createLgDriver(), createAndroidTvDriver(), createBleDriver(), createBtHidDriver()];

const driverFor = (remote: Remote) => drivers.find(d => d.supports(remote));

/** Send one button press of a saved remote through the driver that matches its protocol. */
/** AC state tables keep compact Broadlink packets; decode the one signal being sent into the usual IR shape. */
function withDecodedSignal(remote: Remote, command: string): Remote {
  const sig = remote.signal_data.commands[command] as { broadlink?: string } | undefined;
  if (!sig || typeof sig !== 'object' || typeof sig.broadlink !== 'string') return remote;
  const decoded = decodeBroadlink(sig.broadlink);
  return { ...remote, signal_data: { ...remote.signal_data, commands: { [command]: decoded ?? sig } } };
}

export async function sendCommand(remote: Remote, command: string, ctx: SendContext = { settings: {} }): Promise<SendResult> {
  remote = withDecodedSignal(remote, command);
  // An IR remote linked to a Wi-Fi hub goes through the hub; otherwise through the phone's own IR blaster.
  if (remote.protocol === 'ir' && hubFromSettings(ctx.settings)) return sendViaHub(remote, command, ctx);
  const driver = driverFor(remote);
  if (!driver) return fail('unsupported', `${labelFor(remote)} remotes are not supported yet.`);
  return driver.send(remote, command, ctx);
}

/** Open an app from the remote's app row: the IR remote's own app button, or a launch request over Wi-Fi. */
export async function launchApp(remote: Remote, shortcut: AppShortcut, ctx: SendContext = { settings: {} }): Promise<SendResult> {
  if (shortcut.irKey) return sendCommand(remote, shortcut.irKey, ctx);
  const platform = platformOf(remote);
  const appId = platform ? shortcut.app.ids[platform] : undefined;
  const driver = driverFor(remote);
  if (!appId || !driver?.launchApp) return fail('unsupported', `${shortcut.app.name} can't be opened on this device.`);
  return driver.launchApp(remote, appId, ctx);
}

export function isSupported(remote: { protocol: Remote['protocol'] }): boolean {
  return drivers.some(d => d.supports(remote as Remote));
}

/** Does this remote need a one-time "connect to your device" step before it works? */
export function needsDeviceSetup(remote: Remote): boolean {
  return remote.protocol === 'wifi' || remote.protocol === 'ble' || remote.protocol === 'bluetooth_hid';
}

/** IR remotes work without setup on phones with a blaster; a hub is an optional upgrade. */
export function canUseHub(remote: Remote): boolean {
  return remote.protocol === 'ir';
}

export interface FoundDevice {
  /** What to pass to pairDevice: an IP, a Bluetooth address or a BLE id. */
  id: string;
  label: string;
  detail?: string;
}

/** Find candidate devices: SSDP on Wi-Fi, a BLE scan for lights, or already-paired Bluetooth devices for HID. */
export async function findDevices(remote: Remote): Promise<FoundDevice[]> {
  if (remote.protocol === 'wifi') return (await discoverDevices(remote)).map(d => ({ id: d.ip, label: d.ip, detail: d.server }));
  if (remote.protocol === 'ble') return (await scanLights(remote)).map(d => ({ id: d.id, label: d.name }));
  if (remote.protocol === 'ir') return (await UnimoteHub.discover()).map(h => ({ id: encodeHubId(h), label: `IR hub ${h.host}`, detail: h.mac }));
  if (remote.protocol === 'bluetooth_hid') {
    if (!(await ensureBluetoothPermission())) throw new Error('Bluetooth permission was denied');
    return (await UnimoteHid.bondedDevices()).map(d => ({ id: d.address, label: d.name, detail: d.address }));
  }
  return [];
}

/** Find candidate devices on the local network (Wi-Fi remotes advertise an SSDP search target in their profile). */
export async function discoverDevices(remote: Remote): Promise<SsdpDevice[]> {
  const discovery = remote.signal_data.discovery as { ssdp?: string; mdns?: string } | undefined;
  if (discovery?.mdns === '_androidtvremote2._tcp') return (await UnimoteAtv.discover()).map(d => ({ ip: d.ip, server: d.name }));
  return discovery?.ssdp ? UnimoteLan.ssdpSearch(discovery.ssdp) : [];
}

export async function pairDevice(remote: Remote, host: string, ctx: SendContext, askCode?: AskCode): Promise<PairResult> {
  if (remote.protocol === 'ir') {
    const hub = decodeHubId(host);
    return hub ? { ok: true, settings: { hub }, name: `IR hub ${hub.host}` } : { ok: false, code: 'error', message: 'Pick an IR hub from the list.' };
  }
  const driver = driverFor(remote);
  if (!driver?.pair) return { ok: false, code: 'unsupported', message: 'This remote cannot be connected yet.' };
  return driver.pair(remote, host.trim(), ctx, askCode);
}

function labelFor(remote: Remote): string {
  return { ir: 'Infrared', wifi: 'Wi-Fi', ble: 'Bluetooth LE', bluetooth_hid: 'Bluetooth' }[remote.protocol];
}
