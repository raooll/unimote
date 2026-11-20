// Mirrors the icons the API sends per category so saved remotes render offline.
export const CATEGORY_ICONS: Record<string, string> = {
  tv: 'tv', ac: 'snowflake', streaming: 'cast', cable_box: 'box', soundbar: 'speaker', av_receiver: 'radio',
  speaker: 'volume-2', projector: 'projector', led_lighting: 'lightbulb', fan: 'fan', air_purifier: 'wind',
  humidifier: 'droplets', heater: 'flame', dvd_player: 'disc', blu_ray: 'disc-3', console: 'gamepad-2',
  monitor: 'monitor', tv_tuner: 'satellite-dish', cd_player: 'disc-2', vcr: 'video', other: 'circle-dot',
};

export const PROTOCOL_LABEL = { ir: 'Infrared', wifi: 'Wi-Fi', ble: 'Bluetooth LE', bluetooth_hid: 'Bluetooth' } as const;
