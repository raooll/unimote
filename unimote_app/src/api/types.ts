export type Protocol = 'ir' | 'wifi' | 'ble' | 'bluetooth_hid';

export interface IrSignal {
  frequency: number;
  duty_cycle?: number;
  /** Alternating mark/space durations in microseconds, starting with a mark. */
  pattern: number[];
}

export interface LayoutButton {
  key: string;
  label?: string;
  icon?: string;
}
export interface LayoutRocker {
  label: string;
  up: LayoutButton;
  down: LayoutButton;
}
export interface LayoutSection {
  id: string;
  type: 'row' | 'dpad' | 'rocker' | 'keypad' | 'grid' | 'ac_state';
  buttons?: LayoutButton[];
  rockers?: LayoutRocker[];
}

export interface Category {
  slug: string;
  name: string;
  icon?: string;
  position: number;
  default_layout?: string;
  models_count: number;
}
export interface Brand {
  slug: string;
  name: string;
  models_count?: number | null;
}
export interface ConfigSummary {
  id: number;
  protocol: Protocol;
  variant: string;
  layout_template?: string;
  version: number;
  checksum: string;
  popularity: number;
  success_rate: number | null;
  commands_count: number;
}
export interface ModelSummary {
  id: number;
  slug: string;
  name: string;
  label?: string;
  display_name: string;
  brand: { slug: string; name: string };
  category: string;
  /** Imported remote whose device type is unknown; shown after the categorised ones. */
  uncategorised?: boolean;
  configs: ConfigSummary[];
}
export interface MatchCandidate {
  id: number;
  model: string;
  protocol: Protocol;
  variant: string;
  layout_template?: string;
  version: number;
  popularity: number;
  success_rate: number | null;
  /** Other models that use this exact test signal (collapsed into this candidate). */
  shared_by?: number;
  test: { command: string; signal: unknown } | null;
}

export interface SignalData {
  commands: Record<string, unknown>;
  labels?: Record<string, string>;
  driver?: string;
  [key: string]: unknown;
}
export interface Remote {
  id: number;
  name: string;
  brand: { slug: string; name: string };
  model: { id: number; slug: string; name: string };
  category: string;
  protocol: Protocol;
  variant: string;
  layout_template: string | null;
  layout: { name: string; sections: LayoutSection[] } | null;
  version: number;
  checksum: string;
  updated_at: string;
  signal_data: SignalData;
}

export interface User {
  id: number;
  email: string;
  name: string | null;
  locale: string | null;
  created_at: string;
}
export interface PageMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface SyncRoom { client_uuid: string; name: string; icon?: string | null; position: number }
export interface SyncSavedRemote {
  client_uuid: string;
  name: string;
  position: number;
  settings?: Record<string, unknown> | null;
  remote_config_id: number;
  room_client_uuid?: string | null;
}
export interface SyncScene {
  client_uuid: string;
  name: string;
  icon?: string | null;
  position: number;
  steps: { remote: string; command: string; delay_ms?: number | null }[];
}
export interface SyncPayload {
  rooms: SyncRoom[];
  saved_remotes: SyncSavedRemote[];
  scenes: SyncScene[];
}
export interface SyncSnapshot extends SyncPayload {
  server_time: string;
}
export interface SubmissionInput {
  brand_name: string;
  model_name: string;
  category: string;
  protocol: Protocol;
  notes?: string;
  signal_data: SignalData;
}
