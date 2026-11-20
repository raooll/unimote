import { useCallback, useRef, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Btn, Input, Txt } from './ui';

/**
 * "Type the code shown on your TV" dialog. `ask()` resolves to the typed code, or null when cancelled.
 * Render `element` somewhere in the screen.
 */
export function useCodePrompt() {
  const [state, setState] = useState<{ hint?: string } | null>(null);
  const [value, setValue] = useState('');
  const resolver = useRef<((code: string | null) => void) | null>(null);

  const ask = useCallback((hint?: string) => {
    setValue('');
    setState({ hint });
    return new Promise<string | null>(resolve => {
      resolver.current = resolve;
    });
  }, []);

  const close = (result: string | null) => {
    setState(null);
    resolver.current?.(result);
    resolver.current = null;
  };

  // Top-aligned so the on-screen keyboard can never cover the Pair button.
  const submit = () => value.length === 6 && close(value);
  const element = (
    <Modal visible={!!state} transparent animationType="fade" onRequestClose={() => close(null)}>
      <View className="flex-1 bg-black/50 px-4 pt-24">
        <Pressable className="absolute inset-0" onPress={() => close(null)} accessibilityLabel="Dismiss" />
        <View className="gap-3 rounded-3xl bg-white p-5 dark:bg-[#151b2e]">
          <Txt variant="heading">Enter the code on your TV</Txt>
          <Txt variant="muted">{state?.hint ?? 'A 6-character code is showing on the TV screen.'}</Txt>
          <Input
            label="Code"
            value={value}
            onChangeText={t => setValue(t.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toUpperCase())}
            placeholder="A1B2C3"
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <Btn title="Pair" onPress={submit} disabled={value.length !== 6} />
          <Btn title="Cancel" variant="ghost" onPress={() => close(null)} />
        </View>
      </View>
    </Modal>
  );

  return { ask, element };
}
