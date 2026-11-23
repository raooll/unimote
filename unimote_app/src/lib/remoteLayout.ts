import type { LayoutButton, LayoutRocker, LayoutSection, Remote } from '../api/types';

/**
 * What the user changed about how one saved remote is drawn. Stored in `SavedRemote.settings.layout`,
 * so it is per remote and travels with the existing account sync.
 */
export interface LayoutPrefs {
  /** Number keys (0-9) are hidden until asked for. */
  showNumbers?: boolean;
  /** Button keys the user removed from the screen. */
  hidden?: string[];
  /** Block ids the user removed from the screen. */
  hiddenBlocks?: string[];
  /** Block id -> button keys in the user's order. */
  order?: Record<string, string[]>;
  /** Block ids in the user's order. */
  blocks?: string[];
}

export type BlockType = 'row' | 'grid' | 'keypad' | 'dpad' | 'rocker';

export interface Block {
  id: string;
  type: BlockType;
  buttons: LayoutButton[];
  rockers?: LayoutRocker[];
  /** Buttons inside can be dragged to a new place (a D-pad or a rocker keeps its shape). */
  reorderable: boolean;
}

export interface Rect { x: number; y: number; width: number; height: number }

export const NUMBERS_ID = 'numbers';

const TITLES: Record<string, string> = {
  power: 'Power',
  sources: 'Inputs',
  nav: 'Navigation',
  nav_actions: 'Shortcuts',
  rockers: 'Volume and channel',
  media: 'Playback',
  more: 'More',
  speed: 'Speed',
  temp: 'Temperature',
  modes: 'Modes',
  level: 'Brightness',
  colors: 'Colours',
  [NUMBERS_ID]: 'Numbers',
};

export const blockTitle = (id: string) =>
  TITLES[id] ?? id.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

/** Other names catalog remotes use for the same key, so a D-pad still finds its arrows. */
const ALIASES: Record<string, string[]> = {
  UP: ['UP_ARROW', 'ARROW_UP', 'NAV_UP', 'DPAD_UP', 'CURSOR_UP'],
  DOWN: ['DN_ARROW', 'DOWN_ARROW', 'ARROW_DOWN', 'DN', 'NAV_DOWN', 'DPAD_DOWN', 'CURSOR_DOWN'],
  LEFT: ['LEFT_ARROW', 'ARROW_LEFT', 'NAV_LEFT', 'DPAD_LEFT', 'CURSOR_LEFT'],
  RIGHT: ['RIGHT_ARROW', 'ARROW_RIGHT', 'NAV_RIGHT', 'DPAD_RIGHT', 'CURSOR_RIGHT'],
  OK: ['ENTER', 'SELECT'],
};
const ROLE_OF = new Map(Object.entries(ALIASES).flatMap(([role, names]) => names.map(n => [n, role] as const)));
/** The D-pad slot (UP, DOWN, LEFT, RIGHT, OK) a command key fills, or the key itself. */
export const directionOf = (key: string) => ROLE_OF.get(key) ?? key;

const isDigit = (b: LayoutButton) => /^\d$/.test(b.key);

/**
 * Turns a remote's layout template into the blocks the screen draws. Buttons the remote has no command for are
 * dropped, and commands no template button covers are not shown.
 * A template's keypad is split: 0-9 become a collapsible "Numbers" block, and its other keys (Last, Guide)
 * stay in plain sight as "More".
 */
export function buildBlocks(remote: Pick<Remote, 'layout' | 'signal_data'>): Block[] {
  const commands = remote.signal_data.commands ?? {};
  const has = (key: string) => key in commands;
  /** The command this remote really has for a template key, under its own name if it differs. */
  const resolve = (b: LayoutButton): LayoutButton | null => {
    if (has(b.key)) return b;
    const alt = (ALIASES[b.key] ?? []).find(has);
    return alt ? { ...b, key: alt } : null;
  };
  const used = new Set<string>();
  const out: Block[] = [];

  for (const s of remote.layout?.sections ?? ([] as LayoutSection[])) {
    if (s.type === 'rocker') {
      const rockers = (s.rockers ?? []).filter(r => has(r.up.key) || has(r.down.key));
      rockers.forEach(r => [r.up.key, r.down.key].forEach(k => used.add(k)));
      if (rockers.length) out.push({ id: s.id, type: 'rocker', buttons: [], rockers, reorderable: false });
      continue;
    }
    if (s.type === 'ac_state') continue;
    const buttons = (s.buttons ?? []).map(resolve).filter((b): b is LayoutButton => !!b);
    buttons.forEach(b => used.add(b.key));
    if (!buttons.length) continue;

    if (s.type === 'dpad') {
      // A D-pad is only useful with directions; OK on its own is shown as a row.
      if (buttons.some(b => directionOf(b.key) !== 'OK')) out.push({ id: s.id, type: 'dpad', buttons, reorderable: false });
      else out.push({ id: s.id, type: 'row', buttons, reorderable: true });
    } else if (s.type === 'keypad') {
      const extra = buttons.filter(b => !isDigit(b));
      const digits = buttons.filter(isDigit);
      if (extra.length) out.push({ id: 'more', type: 'row', buttons: extra, reorderable: true });
      if (digits.length) out.push({ id: NUMBERS_ID, type: 'keypad', buttons: digits, reorderable: true });
    } else {
      out.push({ id: s.id, type: s.type === 'grid' ? 'grid' : 'row', buttons, reorderable: true });
    }
  }

  return out;
}

/** `keys` in the order `wanted` asks for; keys `wanted` doesn't mention keep their place at the end. */
export function sortByOrder<T>(items: T[], keyOf: (t: T) => string, wanted?: string[]): T[] {
  if (!wanted?.length) return items;
  const rank = new Map(wanted.map((k, i) => [k, i]));
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => (rank.get(keyOf(a.item)) ?? 1e6 + a.i) - (rank.get(keyOf(b.item)) ?? 1e6 + b.i))
    .map(x => x.item);
}

export interface ShownLayout {
  /** Every block in the user's order, with its buttons in the user's order and hidden buttons removed. */
  blocks: (Block & { hidden: boolean })[];
  /** Buttons the user removed, so they can be put back. */
  hiddenButtons: { block: string; button: LayoutButton }[];
}

export function applyPrefs(blocks: Block[], prefs: LayoutPrefs | undefined): ShownLayout {
  const p = prefs ?? {};
  const hiddenKeys = new Set(p.hidden ?? []);
  const hiddenBlocks = new Set(p.hiddenBlocks ?? []);
  const hiddenButtons: ShownLayout['hiddenButtons'] = [];

  const ordered = sortByOrder(blocks, b => b.id, p.blocks).map(b => {
    if (!b.reorderable) return { ...b, hidden: hiddenBlocks.has(b.id) };
    const sorted = sortByOrder(b.buttons, x => x.key, p.order?.[b.id]);
    const kept = sorted.filter(x => {
      if (!hiddenKeys.has(x.key)) return true;
      hiddenButtons.push({ block: b.id, button: x });
      return false;
    });
    return { ...b, buttons: kept, hidden: hiddenBlocks.has(b.id) };
  });
  return { blocks: ordered, hiddenButtons };
}

/** Moves `dragged` to the place `target` occupies. */
export function reorderKeys(keys: string[], dragged: string, target: string): string[] {
  const from = keys.indexOf(dragged);
  const to = keys.indexOf(target);
  if (from < 0 || to < 0 || from === to) return keys;
  const next = keys.slice();
  next.splice(from, 1);
  next.splice(to, 0, dragged);
  return next;
}

/** The key whose slot the drop point is over, or the nearest one when it lands in a gap. */
export function dropTarget(rects: Record<string, Rect>, point: { x: number; y: number }, dragged: string): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const [key, r] of Object.entries(rects)) {
    if (key === dragged) continue;
    const inside = point.x >= r.x && point.x <= r.x + r.width && point.y >= r.y && point.y <= r.y + r.height;
    if (inside) return key;
    const dx = point.x - (r.x + r.width / 2);
    const dy = point.y - (r.y + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d < bestDist) {
      bestDist = d;
      best = key;
    }
  }
  // A drop far from every slot is a cancel, not a move.
  const reach = Object.values(rects).reduce((m, r) => Math.max(m, r.width, r.height), 0);
  return bestDist <= reach * 1.2 ? best : null;
}

/** Moves a block up (-1) or down (+1) among the visible block ids. */
export function moveBlock(ids: string[], id: string, dir: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const next = ids.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Number of columns a block of this size is laid out in, so buttons stay big and touchable. */
export function columnsFor(type: BlockType, count: number): number {
  if (type === 'grid' || type === 'keypad') return Math.min(3, Math.max(count, 1));
  if (count <= 4) return Math.max(count, 1);
  return count === 5 ? 5 : 3;
}
