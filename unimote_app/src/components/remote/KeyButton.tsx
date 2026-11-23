import { useEffect, useRef } from 'react';
import { Pressable, Text, Vibration, View } from 'react-native';
import type { LayoutButton } from '../../api/types';
import { useColors } from '../../theme';
import { Icon } from '../Icon';

// Hold-to-repeat makes volume / temperature / navigation feel like a physical remote.
const REPEATABLE = new Set([
  'VOL_UP', 'VOL_DOWN', 'CH_UP', 'CH_DOWN', 'TEMP_UP', 'TEMP_DOWN', 'UP', 'DOWN', 'LEFT', 'RIGHT',
  'BRIGHTNESS_UP', 'BRIGHTNESS_DOWN', 'SPEED_UP', 'SPEED_DOWN',
]);

export function KeyButton({ button, label, onPress, size = 'md', accent, disabled, className = '' }: {
  button: LayoutButton;
  label?: string;
  onPress: (command: string) => void;
  size?: 'sm' | 'md' | 'lg';
  accent?: boolean;
  /** Edit mode: the button is only a thing to move, so it never sends. */
  disabled?: boolean;
  className?: string;
}) {
  const c = useColors();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const delay = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => {
    if (delay.current) clearTimeout(delay.current);
    if (timer.current) clearInterval(timer.current);
    delay.current = timer.current = null;
  };
  useEffect(() => stop, []);

  const fire = () => {
    Vibration.vibrate(12);
    onPress(button.key);
  };

  const pressIn = () => {
    if (disabled) return;
    fire();
    if (REPEATABLE.has(button.key)) {
      delay.current = setTimeout(() => {
        timer.current = setInterval(fire, 160);
      }, 450);
    }
  };

  // Generous touch targets: the number keys are hidden by default, so the rest can be large.
  const dims = { sm: 'min-h-[52px] min-w-[52px]', md: 'min-h-[64px]', lg: 'min-h-[80px]' }[size];
  const iconSize = { sm: 22, md: 24, lg: 30 }[size];
  const text = label ?? button.label ?? button.key;
  const power = button.key.startsWith('POWER');
  const bg = accent
    ? 'bg-indigo-600 active:bg-indigo-700'
    : power
      ? 'bg-red-500/90 active:bg-red-600'
      : 'bg-white active:bg-slate-200 dark:bg-[#1c2440] dark:active:bg-[#2a3560]';
  const fg = accent || power ? '#fff' : c.text;

  return (
    <Pressable
      onPressIn={pressIn}
      onPressOut={stop}
      accessibilityRole="button"
      accessibilityLabel={text}
      className={`flex-1 items-center justify-center rounded-3xl border border-slate-200 px-2 py-2 dark:border-[#252d45] ${dims} ${bg} ${className}`}>
      {button.icon ? (
        <View className="items-center gap-0.5">
          <Icon name={button.icon} size={iconSize} color={fg} />
          {size !== 'sm' && !['chevron-up', 'chevron-down', 'chevron-left', 'chevron-right'].includes(button.icon) ? (
            <Text style={{ color: fg }} className="text-xs font-medium" numberOfLines={1}>{text}</Text>
          ) : null}
        </View>
      ) : (
        <Text style={{ color: fg }} className="text-lg font-semibold" numberOfLines={1}>{text}</Text>
      )}
    </Pressable>
  );
}
