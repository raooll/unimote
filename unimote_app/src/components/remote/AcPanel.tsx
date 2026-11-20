import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { Remote } from '../../api/types';
import { Icon } from '../Icon';
import { Card, Chip, Txt } from '../ui';
import { acMeta, commandFor, fit, hasState, initialState, stepTemp, type AcState } from '../../lib/acState';
import { prettify } from '../../lib/commands';

/**
 * Air-conditioner panel for state-table remotes. An AC takes its whole setting on every press, so each
 * change (power, mode, fan, swing, temperature) sends the one signal for the resulting state.
 */
export function AcPanel({
  remote, state, onState, onSend,
}: {
  remote: Remote;
  state: AcState | undefined;
  onState: (s: AcState) => void;
  onSend: (command: string) => void;
}) {
  const meta = acMeta(remote)!;
  const s = fit(meta, state ?? initialState(meta));
  const modeInfo = meta.modes[s.mode];
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (hold.current) clearTimeout(hold.current); }, []);

  const apply = (next: AcState, send = true) => {
    const fitted = fit(meta, next);
    onState(fitted);
    if (!send) return;
    const command = commandFor(remote, fitted);
    if (fitted.on ? hasState(remote, fitted) : true) onSend(command);
  };

  const togglePower = () => apply({ ...s, on: !s.on });
  // While off, changing a setting only updates it; it takes effect when the AC is turned on (like a real remote).
  const change = (patch: Partial<AcState>) => apply({ ...s, ...patch }, s.on);
  const bump = (dir: 1 | -1) => {
    const t = stepTemp(meta, s, dir);
    if (t) change({ temp: t });
  };
  const temps = modeInfo.temps ?? [];
  const showTemp = temps.length > 0;

  return (
    <View className="gap-4">
      <Card className="items-center gap-4 py-6">
        <Pressable
          onPress={togglePower}
          accessibilityRole="button"
          accessibilityLabel={s.on ? 'Turn off' : 'Turn on'}
          className={`h-20 w-20 items-center justify-center rounded-full ${s.on ? 'bg-red-500 active:bg-red-600' : 'bg-slate-300 active:bg-slate-400 dark:bg-slate-700'}`}>
          <Icon name="power" size={32} color="#fff" />
        </Pressable>
        <Txt variant="muted">{s.on ? `${prettify(s.mode)}${s.fan ? ` · fan ${prettify(s.fan).toLowerCase()}` : ''}` : 'Off'}</Txt>

        {showTemp && (
          <View className="flex-row items-center gap-6">
            <Pressable onPress={() => bump(-1)} accessibilityRole="button" accessibilityLabel="Temperature down"
              className="h-14 w-14 items-center justify-center rounded-full bg-slate-200 active:bg-slate-300 dark:bg-[#1e2640]">
              <Icon name="minus" size={26} color="#64748b" />
            </Pressable>
            <View className="items-center">
              <Txt variant="title" className="text-5xl">{s.temp ?? '--'}°</Txt>
            </View>
            <Pressable onPress={() => bump(1)} accessibilityRole="button" accessibilityLabel="Temperature up"
              className="h-14 w-14 items-center justify-center rounded-full bg-slate-200 active:bg-slate-300 dark:bg-[#1e2640]">
              <Icon name="plus" size={26} color="#64748b" />
            </Pressable>
          </View>
        )}
      </Card>

      <Group title="Mode">
        {Object.keys(meta.modes).map(m => (
          <Chip key={m} label={prettify(m)} selected={s.mode === m} onPress={() => change({ mode: m })} />
        ))}
      </Group>
      {(modeInfo.fans?.length ?? 0) > 1 && (
        <Group title="Fan">
          {modeInfo.fans!.map(f => <Chip key={f} label={prettify(f)} selected={s.fan === f} onPress={() => change({ fan: f })} />)}
        </Group>
      )}
      {(modeInfo.swings?.length ?? 0) > 1 && (
        <Group title="Swing">
          {modeInfo.swings!.map(w => <Chip key={w} label={prettify(w)} selected={s.swing === w} onPress={() => change({ swing: w })} />)}
        </Group>
      )}
      {!s.on && <Txt variant="muted" className="text-center">Set it up, then press power. Each change is sent while the AC is on.</Txt>}
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Txt variant="caption" className="mb-2">{title}</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>{children}</ScrollView>
    </View>
  );
}
