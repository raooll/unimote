import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import type { AppShortcut } from '../../lib/appShortcuts';
import { Txt } from '../ui';

/** A row of app tiles (YouTube, Netflix, ...). Tapping one opens that app on the TV. */
export function AppShortcuts({ shortcuts, onLaunch }: {
  shortcuts: AppShortcut[];
  onLaunch: (shortcut: AppShortcut) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (shortcuts.length === 0) return null;

  const launch = async (s: AppShortcut) => {
    if (busy) return;
    setBusy(s.app.id);
    try {
      await onLaunch(s);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="mb-4">
      <Txt variant="caption" className="mb-2">Apps</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2.5 pr-2">
        {shortcuts.map(s => (
          <Pressable
            key={s.app.id}
            onPress={() => launch(s)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${s.app.name}`}
            style={{ backgroundColor: s.app.bg }}
            className="h-16 w-[92px] items-center justify-center rounded-2xl border border-black/10 px-2 active:opacity-70 dark:border-white/10">
            {busy === s.app.id ? (
              <ActivityIndicator color={s.app.fg} />
            ) : (
              <Text style={{ color: s.app.fg }} className="text-center text-sm font-bold" numberOfLines={2}>
                {s.app.name}
              </Text>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
