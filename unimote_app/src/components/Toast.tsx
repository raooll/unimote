import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUi } from '../store/ui';

export function ToastHost() {
  const toast = useUi(s => s.toast);
  const hide = useUi(s => s.hide);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(hide, toast.kind === 'error' ? 4000 : 2200);
    return () => clearTimeout(t);
  }, [toast, hide]);
  if (!toast) return null;
  return (
    <View pointerEvents="none" style={{ bottom: insets.bottom + 84 }} className="absolute inset-x-0 items-center px-6">
      <View className={`max-w-full rounded-2xl px-4 py-3 ${toast.kind === 'error' ? 'bg-red-600' : 'bg-slate-800'}`}>
        <Text className="text-center text-sm font-medium text-white">{toast.message}</Text>
      </View>
    </View>
  );
}
