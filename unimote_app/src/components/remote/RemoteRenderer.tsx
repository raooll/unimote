import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { LayoutButton, Remote } from '../../api/types';
import {
  applyPrefs,
  blockTitle,
  buildBlocks,
  columnsFor,
  directionOf,
  moveBlock,
  NUMBERS_ID,
  type Block,
  type LayoutPrefs,
} from '../../lib/remoteLayout';
import { useColors } from '../../theme';
import { Icon } from '../Icon';
import { Txt } from '../ui';
import { KeyButton } from './KeyButton';
import { ReorderGrid } from './ReorderGrid';

const labelOf = (b: LayoutButton) => b.label ?? b.key;

/**
 * Draws a remote from its layout template plus the user's own changes (`prefs`): number keys folded away until
 * asked for, buttons and blocks in the user's order, and anything they removed left out. While `editing`, every
 * button is a thing to hold and move instead of a thing to press.
 */
export function RemoteRenderer({ remote, prefs, onPrefs, editing, onPress, onDragActive }: {
  remote: Remote;
  prefs: LayoutPrefs | undefined;
  onPrefs: (next: LayoutPrefs) => void;
  editing: boolean;
  onPress: (command: string) => void;
  onDragActive?: (active: boolean) => void;
}) {
  const blocks = useMemo(() => buildBlocks(remote), [remote.id, remote.version]);
  const shown = useMemo(() => applyPrefs(blocks, prefs), [blocks, prefs]);
  const p = prefs ?? {};
  const set = (patch: Partial<LayoutPrefs>) => onPrefs({ ...p, ...patch });
  const ids = shown.blocks.map(b => b.id);
  const list = editing ? shown.blocks : shown.blocks.filter(b => !b.hidden);

  const toggleBlock = (id: string) => {
    const cur = new Set(p.hiddenBlocks ?? []);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    set({ hiddenBlocks: [...cur] });
  };

  if (blocks.length === 0) return <Txt variant="muted">This remote has no buttons.</Txt>;

  return (
    <View className="gap-4">
      {list.map((b, i) => (
        <View key={b.id} className={editing && b.hidden ? 'opacity-40' : ''}>
          {editing ? (
            <BlockHeader
              title={blockTitle(b.id)}
              hidden={b.hidden}
              first={i === 0}
              last={i === list.length - 1}
              onUp={() => set({ blocks: moveBlock(ids, b.id, -1) })}
              onDown={() => set({ blocks: moveBlock(ids, b.id, 1) })}
              onToggle={() => toggleBlock(b.id)}
            />
          ) : null}
          <BlockBody
            block={b}
            editing={editing}
            numbersOpen={!!p.showNumbers}
            onToggleNumbers={() => set({ showNumbers: !p.showNumbers })}
            onPress={onPress}
            onOrder={keys => set({ order: { ...p.order, [b.id]: keys } })}
            onHide={key => set({ hidden: [...(p.hidden ?? []), key] })}
            onDragActive={onDragActive}
          />
        </View>
      ))}

      {!editing && list.length === 0 && (
        <Txt variant="muted" className="text-center">Everything is hidden. Open Customize to bring buttons back.</Txt>
      )}

      {editing && shown.hiddenButtons.length > 0 && (
        <View>
          <Txt variant="caption" className="mb-2">Hidden buttons — tap to bring back</Txt>
          <View className="flex-row flex-wrap gap-2">
            {shown.hiddenButtons.map(({ button }) => (
              <Pressable
                key={button.key}
                accessibilityRole="button"
                accessibilityLabel={`Bring back ${labelOf(button)}`}
                onPress={() => set({ hidden: (p.hidden ?? []).filter(k => k !== button.key) })}
                className="flex-row items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-2 dark:border-[#252d45] dark:bg-[#1c2440]">
                <Icon name="plus" size={14} />
                <Text className="text-sm text-slate-900 dark:text-slate-50">{labelOf(button)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function BlockHeader({ title, hidden, first, last, onUp, onDown, onToggle }: {
  title: string;
  hidden: boolean;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onToggle: () => void;
}) {
  const c = useColors();
  const tool = (name: string, label: string, onPress: () => void, off = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={off}
      onPress={onPress}
      hitSlop={6}
      className={`h-9 w-9 items-center justify-center rounded-full bg-slate-200 dark:bg-[#252d45] ${off ? 'opacity-30' : ''}`}>
      <Icon name={name} size={18} color={c.text} />
    </Pressable>
  );
  return (
    <View className="mb-2 flex-row items-center gap-2">
      <Txt variant="caption" className="flex-1">{title}</Txt>
      {tool('chevron-up', `Move ${title} up`, onUp, first)}
      {tool('chevron-down', `Move ${title} down`, onDown, last)}
      {tool(hidden ? 'eye-off' : 'eye', hidden ? `Show ${title}` : `Hide ${title}`, onToggle)}
    </View>
  );
}

function BlockBody({ block, editing, numbersOpen, onToggleNumbers, onPress, onOrder, onHide, onDragActive }: {
  block: Block;
  editing: boolean;
  numbersOpen: boolean;
  onToggleNumbers: () => void;
  onPress: (command: string) => void;
  onOrder: (keys: string[]) => void;
  onHide: (key: string) => void;
  onDragActive?: (active: boolean) => void;
}) {
  const c = useColors();

  if (block.type === 'dpad') return <Dpad block={block} editing={editing} onPress={onPress} />;
  if (block.type === 'rocker') return <Rockers block={block} editing={editing} onPress={onPress} />;

  const isNumbers = block.id === NUMBERS_ID;
  // Editing always shows the numbers, otherwise there would be nothing to arrange.
  const open = !isNumbers || editing || numbersOpen;
  const size = block.id === 'power' ? 'lg' : 'md';

  return (
    <View className="gap-3">
      {isNumbers && !editing ? (
        <Pressable
          onPress={onToggleNumbers}
          accessibilityRole="button"
          accessibilityLabel={numbersOpen ? 'Hide number keys' : 'Show number keys'}
          className="flex-row items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white py-4 dark:border-[#252d45] dark:bg-[#1c2440]">
          <Icon name="hash" size={20} color={c.accent} />
          <Text style={{ color: c.text }} className="text-base font-semibold">{numbersOpen ? 'Hide numbers' : 'Numbers'}</Text>
          <Icon name={numbersOpen ? 'chevron-up' : 'chevron-down'} size={18} color={c.text} />
        </Pressable>
      ) : null}
      {open && block.buttons.length > 0 ? (
        <ReorderGrid
          enabled={editing && block.reorderable}
          columns={columnsFor(block.type, block.buttons.length)}
          onReorder={onOrder}
          onDragActive={onDragActive}
          items={block.buttons.map(b => ({
            key: b.key,
            node: <KeyButton button={b} label={labelOf(b)} onPress={onPress} size={size} disabled={editing} className="w-full" />,
            badge:
              editing && block.reorderable ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Hide ${labelOf(b)}`}
                  onPress={() => onHide(b.key)}
                  hitSlop={6}
                  className="absolute right-1 top-1 h-7 w-7 items-center justify-center rounded-full bg-indigo-600">
                  <Icon name="x" size={14} color="#fff" />
                </Pressable>
              ) : null,
          }))}
        />
      ) : null}
    </View>
  );
}

function Rockers({ block, editing, onPress }: { block: Block; editing: boolean; onPress: (c: string) => void }) {
  return (
    <View className="flex-row gap-3" pointerEvents={editing ? 'none' : 'auto'}>
      {(block.rockers ?? []).map(r => (
        <View key={r.label} className="flex-1 items-center gap-2 rounded-3xl border border-slate-200 bg-white p-2 dark:border-[#252d45] dark:bg-[#151b2e]">
          <KeyButton button={r.up} onPress={onPress} size="lg" disabled={editing} className="w-full" />
          <Text className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{r.label}</Text>
          <KeyButton button={r.down} onPress={onPress} size="lg" disabled={editing} className="w-full" />
        </View>
      ))}
    </View>
  );
}

function Dpad({ block, editing, onPress }: { block: Block; editing: boolean; onPress: (c: string) => void }) {
  const by = (k: string) => block.buttons.find(b => directionOf(b.key) === k);
  const slot = (k: string) => (by(k) ? <KeyButton button={by(k)!} onPress={onPress} size="lg" disabled={editing} /> : <View className="flex-1" />);
  return (
    <View className="gap-2 rounded-[36px] border border-slate-200 bg-white p-3 dark:border-[#252d45] dark:bg-[#151b2e]" pointerEvents={editing ? 'none' : 'auto'}>
      <View className="flex-row gap-2"><View className="flex-1" />{slot('UP')}<View className="flex-1" /></View>
      <View className="flex-row gap-2">
        {slot('LEFT')}
        {by('OK') ? <KeyButton button={by('OK')!} onPress={onPress} size="lg" accent disabled={editing} /> : <View className="flex-1" />}
        {slot('RIGHT')}
      </View>
      <View className="flex-row gap-2"><View className="flex-1" />{slot('DOWN')}<View className="flex-1" /></View>
    </View>
  );
}
