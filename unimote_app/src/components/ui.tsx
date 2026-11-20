import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '../theme';
import { Icon } from './Icon';

export function Screen({ children, scroll, edges = ['bottom'] as ('top' | 'bottom')[], className = '' }: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
  className?: string;
}) {
  const body = scroll ? (
    <ScrollView className="flex-1" contentContainerClassName="px-4 pb-8 pt-2" keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View className={`flex-1 px-4 pt-2 ${className}`}>{children}</View>
  );
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-slate-50 dark:bg-[#0b1020]">
      {body}
    </SafeAreaView>
  );
}

export function Txt({ children, variant = 'body', className = '', numberOfLines }: {
  children: ReactNode;
  variant?: 'title' | 'heading' | 'body' | 'muted' | 'caption';
  className?: string;
  numberOfLines?: number;
}) {
  const styles = {
    title: 'text-3xl font-bold text-slate-900 dark:text-slate-50',
    heading: 'text-lg font-semibold text-slate-900 dark:text-slate-50',
    body: 'text-base text-slate-800 dark:text-slate-100',
    muted: 'text-sm text-slate-500 dark:text-slate-400',
    caption: 'text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400',
  } as const;
  return (
    <Text numberOfLines={numberOfLines} className={`${styles[variant]} ${className}`}>
      {children}
    </Text>
  );
}

export function Card({ children, className = '', ...rest }: ViewProps & { className?: string }) {
  return (
    <View
      className={`rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#252d45] dark:bg-[#151b2e] ${className}`}
      {...rest}>
      {children}
    </View>
  );
}

export function Btn({ title, onPress, variant = 'primary', loading, disabled, icon, className = '' }: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  className?: string;
}) {
  const c = useColors();
  const bg = {
    primary: 'bg-indigo-600 active:bg-indigo-700',
    secondary: 'bg-slate-200 active:bg-slate-300 dark:bg-[#252d45] dark:active:bg-[#2f3858]',
    danger: 'bg-red-600 active:bg-red-700',
    ghost: 'bg-transparent active:bg-slate-200/60 dark:active:bg-white/10',
  }[variant];
  const text = variant === 'primary' || variant === 'danger' ? 'text-white' : 'text-slate-900 dark:text-slate-50';
  const iconColor = variant === 'primary' || variant === 'danger' ? '#fff' : c.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      className={`min-h-[48px] flex-row items-center justify-center gap-2 rounded-xl px-5 ${bg} ${disabled ? 'opacity-40' : ''} ${className}`}>
      {loading ? <ActivityIndicator color={iconColor} /> : icon ? <Icon name={icon} size={18} color={iconColor} /> : null}
      <Text className={`text-base font-semibold ${text}`}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress: () => void; icon?: string }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      className={`mr-2 flex-row items-center gap-1.5 rounded-full border px-4 py-2 ${
        selected ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white dark:border-[#252d45] dark:bg-[#151b2e]'
      }`}>
      {icon ? <Icon name={icon} size={14} color={selected ? '#fff' : c.muted} /> : null}
      <Text className={`text-sm font-medium ${selected ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>{label}</Text>
    </Pressable>
  );
}

export function SearchBar(props: TextInputProps) {
  const c = useColors();
  return (
    <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 dark:border-[#252d45] dark:bg-[#151b2e]">
      <Icon name="search" size={18} color={c.muted} />
      <TextInput
        placeholderTextColor={c.muted}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        className="h-12 flex-1 text-base text-slate-900 dark:text-slate-50"
        {...props}
      />
    </View>
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  const c = useColors();
  const { label, ...rest } = props;
  return (
    <View className="mb-3">
      {label ? <Txt variant="caption" className="mb-1.5">{label}</Txt> : null}
      <TextInput
        placeholderTextColor={c.muted}
        className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-900 dark:border-[#252d45] dark:bg-[#151b2e] dark:text-slate-50"
        {...rest}
      />
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const c = useColors();
  return (
    <View className="flex-1 items-center justify-center gap-3 p-8">
      <ActivityIndicator color={c.accent} size="large" />
      {label ? <Txt variant="muted">{label}</Txt> : null}
    </View>
  );
}

export function EmptyState({ icon, title, message, action }: { icon: string; title: string; message?: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View className="flex-1 items-center justify-center gap-3 p-8">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-500/15">
        <Icon name={icon} size={28} color={c.accent} />
      </View>
      <Txt variant="heading" className="text-center">{title}</Txt>
      {message ? <Txt variant="muted" className="text-center">{message}</Txt> : null}
      {action}
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="wifi-off"
      title="Something went wrong"
      message={message}
      action={onRetry ? <Btn title="Try again" variant="secondary" icon="refresh-cw" onPress={onRetry} /> : undefined}
    />
  );
}
