import { useState } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { Btn, Input, Screen, Txt } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';
import { useUi } from '../store/ui';

/** "Please add this device": tells us which brand/model people are missing, so we can prioritise the catalog. */
export function RequestModelScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { category, brand: brand0, model: model0 } = useRoute<NativeStackScreenProps<RootStackParamList, 'RequestModel'>['route']>().params;
  const toast = useUi(s => s.show);
  const [brand, setBrand] = useState(brand0 ?? '');
  const [model, setModel] = useState(model0 ?? '');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!brand.trim()) return toast('Enter the brand', 'error');
    setBusy(true);
    try {
      await api.requestModel({ brand_name: brand.trim(), model_name: model.trim() || undefined, category: category.slug, notes: notes.trim() || undefined });
      setDone(true);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not send the request', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3 px-4">
          <Txt variant="title" className="text-center">Thanks, request sent</Txt>
          <Txt variant="muted" className="text-center">
            The more people ask for a device, the sooner we add it. If you have a Wi-Fi IR hub you can also record your own remote now.
          </Txt>
          <View className="mt-3 w-full gap-2">
            <Btn title="Record my remote" icon="radio" onPress={() => nav.replace('Learn')} />
            <Btn title="Done" variant="secondary" onPress={() => nav.popToTop()} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Txt variant="heading" className="mb-1">Request a {category.name.toLowerCase()}</Txt>
      <Txt variant="muted" className="mb-4">Tell us what you have. No account needed.</Txt>
      <View className="gap-3">
        <Input label="Brand" value={brand} onChangeText={setBrand} placeholder="e.g. Hisense" autoCapitalize="words" />
        <Input label="Model (optional)" value={model} onChangeText={setModel} placeholder="Printed on the device or remote" autoCapitalize="characters" />
        <Input label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Anything that helps, e.g. 55 inch, bought in 2022" multiline />
        <Btn title="Send request" icon="send" loading={busy} onPress={submit} />
      </View>
    </Screen>
  );
}
