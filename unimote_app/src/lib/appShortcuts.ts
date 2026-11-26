import type { Remote } from '../api/types';

/** The TV platforms that can open an app over Wi-Fi, named after the profile's `signal_data.driver`. */
export type AppPlatform = 'roku_ecp' | 'samsung_tizen' | 'lg_webos' | 'android_tv';

export interface TvApp {
  id: string;
  name: string;
  /** Tile colour (the app's own brand colour) and the text colour that reads on it. */
  bg: string;
  fg: string;
  /** How each platform names the app: Roku channel id, Samsung app id, webOS app id, Android package name. */
  ids: Partial<Record<AppPlatform, string>>;
  /** Dedicated buttons some IR remotes have for the app (as named in the catalog). */
  irKeys?: string[];
}

/**
 * Popular streaming apps, most used first. Ids come from each platform's public app listings; an app without an id for
 * a platform is simply not offered there. The Indian apps (JioHotstar, ZEE5, Sony LIV) are only mapped for Android TV,
 * where they are most common.
 */
export const TV_APPS: TvApp[] = [
  {
    id: 'youtube', name: 'YouTube', bg: '#FF0000', fg: '#FFFFFF',
    ids: { roku_ecp: '837', samsung_tizen: '111299001912', lg_webos: 'youtube.leanback.v4', android_tv: 'com.google.android.youtube.tv' },
    irKeys: ['YOUTUBE'],
  },
  {
    id: 'netflix', name: 'Netflix', bg: '#000000', fg: '#E50914',
    ids: { roku_ecp: '12', samsung_tizen: '3201907018807', lg_webos: 'netflix', android_tv: 'com.netflix.ninja' },
    irKeys: ['NETFLIX'],
  },
  {
    id: 'prime', name: 'Prime Video', bg: '#00A8E1', fg: '#FFFFFF',
    ids: { roku_ecp: '13', samsung_tizen: '3201910019365', lg_webos: 'amazon', android_tv: 'com.amazon.amazonvideo.livingroom' },
    irKeys: ['PRIME_VIDEO', 'AMAZON'],
  },
  {
    id: 'hotstar', name: 'JioHotstar', bg: '#0F1E5A', fg: '#FFFFFF',
    ids: { android_tv: 'in.startv.hotstar' },
    irKeys: ['HOTSTAR', 'JIOHOTSTAR'],
  },
  {
    id: 'disney', name: 'Disney+', bg: '#113CCF', fg: '#FFFFFF',
    ids: { roku_ecp: '291097', samsung_tizen: '3201901017640', lg_webos: 'com.disney.disneyplus-prod', android_tv: 'com.disney.disneyplus' },
    irKeys: ['DISNEY_PLUS', 'DISNEY'],
  },
  {
    id: 'spotify', name: 'Spotify', bg: '#1DB954', fg: '#000000',
    ids: { roku_ecp: '22297', samsung_tizen: '3201606009684', lg_webos: 'spotify-beehive', android_tv: 'com.spotify.tv.android' },
    irKeys: ['SPOTIFY'],
  },
  {
    id: 'zee5', name: 'ZEE5', bg: '#8230C6', fg: '#FFFFFF',
    ids: { android_tv: 'com.graymatrix.did' },
  },
  {
    id: 'sonyliv', name: 'Sony LIV', bg: '#1A1A1A', fg: '#FFFFFF',
    ids: { android_tv: 'com.sonyliv' },
  },
  {
    id: 'appletv', name: 'Apple TV', bg: '#1C1C1E', fg: '#FFFFFF',
    ids: { roku_ecp: '551012', samsung_tizen: '3201807016597', lg_webos: 'com.apple.appletv', android_tv: 'com.apple.atve.androidtv.appletv' },
    irKeys: ['APPLE_TV', 'APPLETV'],
  },
];

export interface AppShortcut {
  app: TvApp;
  /** For an IR remote: the remote's own button that opens the app. Otherwise the app is launched over Wi-Fi. */
  irKey?: string;
}

const PLATFORMS = new Set<string>(['roku_ecp', 'samsung_tizen', 'lg_webos', 'android_tv']);

export const platformOf = (remote: Pick<Remote, 'protocol' | 'signal_data'>): AppPlatform | null => {
  const driver = remote.signal_data.driver;
  return remote.protocol === 'wifi' && typeof driver === 'string' && PLATFORMS.has(driver) ? (driver as AppPlatform) : null;
};

/**
 * The app buttons this remote can offer: a Wi-Fi TV can open any app mapped for its platform; an IR remote only the
 * apps it has a dedicated button for. Other remotes (Bluetooth, lights, ACs) get none.
 */
export function appShortcutsFor(remote: Pick<Remote, 'protocol' | 'signal_data'>): AppShortcut[] {
  const platform = platformOf(remote);
  if (platform) return TV_APPS.filter(a => a.ids[platform]).map(app => ({ app }));
  if (remote.protocol !== 'ir') return [];
  const commands = remote.signal_data.commands ?? {};
  const out: AppShortcut[] = [];
  for (const app of TV_APPS) {
    const irKey = app.irKeys?.find(k => k in commands);
    if (irKey) out.push({ app, irKey });
  }
  return out;
}

/** The link the Android TV remote protocol opens: `market://launch?id=<package>` starts an installed app. */
export const androidTvAppLink = (pkg: string) => (pkg.includes('://') ? pkg : `market://launch?id=${pkg}`);
