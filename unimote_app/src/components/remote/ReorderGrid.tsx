import { useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Vibration, View, type DimensionValue } from 'react-native';
import { dropTarget, reorderKeys, type Rect } from '../../lib/remoteLayout';

export interface GridItem {
  key: string;
  node: ReactNode;
  /** Drawn over the item's corner, e.g. a remove button. Stays tappable while editing. */
  badge?: ReactNode;
}

/** How long a finger must rest on a button before it is picked up. Moving sooner scrolls the page instead. */
const HOLD_MS = 260;
const MOVE_SLOP = 10;

/**
 * A wrapping grid whose items can be picked up by holding and dropped on another slot.
 * Disabled, it is just a plain grid, so the remote looks the same in both modes.
 */
export function ReorderGrid({ items, columns, enabled, onReorder, onDragActive }: {
  items: GridItem[];
  columns: number;
  enabled: boolean;
  onReorder: (keys: string[]) => void;
  /** True while a button is held, so the page can stop scrolling under the finger. */
  onDragActive?: (active: boolean) => void;
}) {
  const rects = useRef<Record<string, Rect>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const keys = items.map(i => i.key);
  const width = `${100 / columns}%` as DimensionValue;

  const centre = (key: string, dx: number, dy: number) => {
    const r = rects.current[key];
    return { x: r.x + r.width / 2 + dx, y: r.y + r.height / 2 + dy };
  };

  const start = (key: string) => {
    setDragging(key);
    onDragActive?.(true);
  };
  const move = (key: string, dx: number, dy: number) => {
    if (rects.current[key]) setHover(dropTarget(rects.current, centre(key, dx, dy), key));
  };
  const end = (key: string, dx: number | null, dy: number | null) => {
    const target = dx == null || dy == null || !rects.current[key] ? null : dropTarget(rects.current, centre(key, dx, dy), key);
    setDragging(null);
    setHover(null);
    onDragActive?.(false);
    if (target) onReorder(reorderKeys(keys, key, target));
  };

  return (
    <View className="-mx-1 flex-row flex-wrap">
      {items.map(item => (
        <DragItem
          key={item.key}
          id={item.key}
          enabled={enabled}
          width={width}
          lifted={dragging === item.key}
          hovered={hover === item.key}
          onRect={r => { rects.current[item.key] = r; }}
          onStart={start}
          onMove={move}
          onEnd={end}
          badge={item.badge}>
          {item.node}
        </DragItem>
      ))}
    </View>
  );
}

function DragItem({ id, enabled, width, lifted, hovered, onRect, onStart, onMove, onEnd, badge, children }: {
  id: string;
  enabled: boolean;
  width: DimensionValue;
  lifted: boolean;
  hovered: boolean;
  onRect: (r: Rect) => void;
  onStart: (id: string) => void;
  onMove: (id: string, dx: number, dy: number) => void;
  onEnd: (id: string, dx: number | null, dy: number | null) => void;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const pan = useRef(new Animated.ValueXY()).current;
  const live = useRef({ held: false, timer: null as ReturnType<typeof setTimeout> | null });
  // The responder is created once, so it reads the latest props through this ref.
  const props = useRef({ enabled, onStart, onMove, onEnd });
  props.current = { enabled, onStart, onMove, onEnd };

  const finish = (dx: number | null, dy: number | null) => {
    const s = live.current;
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    const wasHeld = s.held;
    s.held = false;
    pan.setValue({ x: 0, y: 0 });
    if (wasHeld) props.current.onEnd(id, dx, dy);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => props.current.enabled,
      onMoveShouldSetPanResponder: () => false,
      onPanResponderGrant: () => {
        const s = live.current;
        s.held = false;
        s.timer = setTimeout(() => {
          s.held = true;
          Vibration.vibrate(25);
          props.current.onStart(id);
        }, HOLD_MS);
      },
      onPanResponderMove: (_e, g) => {
        const s = live.current;
        if (!s.held) {
          // Moved before the hold finished: the user is scrolling, not rearranging.
          if (s.timer && Math.hypot(g.dx, g.dy) > MOVE_SLOP) {
            clearTimeout(s.timer);
            s.timer = null;
          }
          return;
        }
        pan.setValue({ x: g.dx, y: g.dy });
        props.current.onMove(id, g.dx, g.dy);
      },
      onPanResponderRelease: (_e, g) => finish(g.dx, g.dy),
      onPanResponderTerminate: () => finish(null, null),
      // Let the page scroll take over until the button is actually held.
      onPanResponderTerminationRequest: () => !live.current.held,
    }),
  ).current;

  return (
    <Animated.View
      {...responder.panHandlers}
      onLayout={e => onRect(e.nativeEvent.layout)}
      style={{
        width,
        zIndex: lifted ? 50 : 0,
        elevation: lifted ? 8 : 0,
        opacity: lifted ? 0.92 : 1,
        transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: lifted ? 1.06 : 1 }],
      }}>
      <View pointerEvents={enabled ? 'none' : 'auto'} className="p-1">{children}</View>
      {enabled ? (
        <View
          pointerEvents="none"
          className={`absolute inset-1 rounded-3xl border-2 ${hovered ? 'border-solid border-indigo-500 bg-indigo-500/10' : 'border-dashed border-indigo-400/60'}`}
        />
      ) : null}
      {badge}
    </Animated.View>
  );
}
