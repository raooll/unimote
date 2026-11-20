import { useMemo } from 'react';
import { Text, View } from 'react-native';
import type { LayoutButton, LayoutSection, Remote } from '../../api/types';
import { Txt } from '../ui';
import { KeyButton } from './KeyButton';

const prettify = (key: string) => key.toLowerCase().replace(/_/g, ' ').replace(/^\w/, ch => ch.toUpperCase());

/**
 * Draws a remote from its layout template. Buttons the remote has no command for are hidden;
 * commands no layout button covers go to an "Other buttons" section so nothing is unreachable.
 */
export function RemoteRenderer({ remote, onPress }: { remote: Remote; onPress: (command: string) => void }) {
  const commands = remote.signal_data.commands;
  const has = (key: string) => key in commands;

  const { sections, others } = useMemo(() => {
    const used = new Set<string>();
    const out: LayoutSection[] = [];
    for (const s of remote.layout?.sections ?? []) {
      if (s.type === 'rocker') {
        const rockers = (s.rockers ?? []).filter(r => has(r.up.key) || has(r.down.key));
        rockers.forEach(r => [r.up.key, r.down.key].forEach(k => used.add(k)));
        if (rockers.length) out.push({ ...s, rockers });
      } else {
        const buttons = (s.buttons ?? []).filter(b => has(b.key));
        buttons.forEach(b => used.add(b.key));
        if (s.type === 'dpad') {
          // A D-pad is only useful when it has directions; OK alone is shown as a row.
          if (buttons.some(b => b.key !== 'OK')) out.push({ ...s, buttons });
          else if (buttons.length) out.push({ ...s, type: 'row', buttons });
        } else if (buttons.length) out.push({ ...s, buttons });
      }
    }
    const rest = Object.keys(commands).filter(k => !used.has(k));
    return { sections: out, others: rest };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote.id, remote.version]);

  return (
    <View className="gap-3">
      {sections.map(s => (
        <Section key={s.id} section={s} onPress={onPress} />
      ))}
      {others.length > 0 && (
        <View>
          <Txt variant="caption" className="mb-2">Other buttons</Txt>
          <View className="flex-row flex-wrap gap-2">
            {others.map(k => (
              <View key={k} className="w-[31%]">
                <KeyButton button={{ key: k }} label={remote.signal_data.labels?.[k] ?? prettify(k)} onPress={onPress} size="sm" />
              </View>
            ))}
          </View>
        </View>
      )}
      {sections.length === 0 && others.length === 0 && <Txt variant="muted">This remote has no buttons.</Txt>}
    </View>
  );
}

function Section({ section, onPress }: { section: LayoutSection; onPress: (c: string) => void }) {
  const btn = (b: LayoutButton, size: 'sm' | 'md' | 'lg' = 'md', extra = '') => (
    <KeyButton key={b.key} button={b} onPress={onPress} size={size} className={extra} />
  );

  switch (section.type) {
    case 'row':
      return <View className="flex-row gap-2">{(section.buttons ?? []).map(b => btn(b))}</View>;

    case 'grid':
      return (
        <View className="flex-row flex-wrap gap-2">
          {(section.buttons ?? []).map(b => (
            <View key={b.key} className="w-[31.5%]">{btn(b, 'md')}</View>
          ))}
        </View>
      );

    case 'keypad':
      return (
        <View className="flex-row flex-wrap gap-2">
          {(section.buttons ?? []).map(b => (
            <View key={b.key} className="w-[31.5%]">{btn(b, 'md')}</View>
          ))}
        </View>
      );

    case 'rocker':
      return (
        <View className="flex-row gap-3">
          {(section.rockers ?? []).map(r => (
            <View key={r.label} className="flex-1 items-center gap-2 rounded-3xl border border-slate-200 bg-white p-2 dark:border-[#252d45] dark:bg-[#151b2e]">
              {btn(r.up, 'lg')}
              <Text className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{r.label}</Text>
              {btn(r.down, 'lg')}
            </View>
          ))}
        </View>
      );

    case 'dpad': {
      const by = (k: string) => (section.buttons ?? []).find(b => b.key === k);
      const slot = (k: string) => (by(k) ? btn(by(k)!, 'lg') : <View className="flex-1" />);
      return (
        <View className="gap-2 rounded-3xl border border-slate-200 bg-white p-3 dark:border-[#252d45] dark:bg-[#151b2e]">
          <View className="flex-row gap-2"><View className="flex-1" />{slot('UP')}<View className="flex-1" /></View>
          <View className="flex-row gap-2">
            {slot('LEFT')}
            {by('OK') ? <KeyButton button={by('OK')!} onPress={onPress} size="lg" accent /> : <View className="flex-1" />}
            {slot('RIGHT')}
          </View>
          <View className="flex-row gap-2"><View className="flex-1" />{slot('DOWN')}<View className="flex-1" /></View>
        </View>
      );
    }
    default:
      return null;
  }
}
