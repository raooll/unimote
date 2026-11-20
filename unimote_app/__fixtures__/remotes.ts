import type { Remote } from '../src/api/types';

const sig = { frequency: 38000, duty_cycle: 0.33, pattern: [9000, 4500, 560, 560, 560] };

export const irRemote: Remote = {
  id: 42,
  name: 'Samsung AA59-00443A',
  brand: { slug: 'samsung', name: 'Samsung' },
  model: { id: 7, slug: 'aa59', name: 'AA59-00443A' },
  category: 'tv',
  protocol: 'ir',
  variant: 'Samsung_AA59',
  layout_template: 'tv_standard',
  layout: {
    name: 'TV',
    sections: [
      { id: 'power', type: 'row', buttons: [{ key: 'POWER', label: 'Power' }, { key: 'MUTE', label: 'Mute' }] },
      {
        id: 'rockers', type: 'rocker',
        rockers: [{ label: 'Vol', up: { key: 'VOL_UP', label: 'Vol +' }, down: { key: 'VOL_DOWN', label: 'Vol -' } }],
      },
      { id: 'media', type: 'row', buttons: [{ key: 'PLAY', label: 'Play' }, { key: 'STOP', label: 'Stop' }] },
    ],
  },
  version: 1,
  checksum: 'abc',
  updated_at: '2026-01-01T00:00:00Z',
  signal_data: {
    // VOL_DOWN, MUTE, PLAY, STOP intentionally missing; NETFLIX is not in the layout.
    commands: { POWER: sig, VOL_UP: sig, NETFLIX: sig },
    labels: { NETFLIX: 'Netflix' },
  },
};

export const wifiRemote: Remote = {
  ...irRemote,
  id: 43,
  protocol: 'wifi',
  signal_data: { driver: 'roku_ecp', commands: { POWER: 'Power' } },
};
