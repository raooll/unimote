import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import type { ModelSummary } from '../api/types';
import { Icon } from '../components/Icon';
import { Btn, ErrorView, Loading, Screen, SearchBar, Txt } from '../components/ui';
import { PROTOCOL_LABEL } from '../lib/categories';
import { useDebounced, usePaginated } from '../lib/hooks';
import type { RootStackParamList } from '../navigation/types';
import { useColors } from '../theme';

export function AddModelScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { category, brand } = useRoute<NativeStackScreenProps<RootStackParamList, 'AddModel'>['route']>().params;
  const c = useColors();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);

  const { items, loading, error, loadMore, reload } = usePaginated<ModelSummary>(
    async page => {
      const r = await api.models({ category: category.slug, brand: brand.slug, q: dq || undefined, page, per_page: 40 });
      return { items: r.models, meta: r.meta };
    },
    [category.slug, brand.slug, dq],
  );

  const tryAll = () => nav.navigate('Match', { category, brand });

  return (
    <Screen>
      <Txt variant="heading" className="mb-1">{brand.name} {category.name}</Txt>
      <Txt variant="muted" className="mb-3">Pick your model, usually printed on the remote or the device.</Txt>
      <SearchBar value={q} onChangeText={setQ} placeholder="Search model (e.g. AA59, FTKF50)" />
      {error && items.length === 0 ? (
        <ErrorView message={error} onRetry={reload} />
      ) : loading && items.length === 0 ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={m => String(m.id)}
          keyboardShouldPersistTaps="handled"
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={<Txt variant="muted" className="mt-6 text-center">No model matches “{dq}”.</Txt>}
          ListFooterComponent={
            <View className="gap-2 py-4">
              {loading ? <Loading /> : null}
              <Btn title={`Not sure? Try the ${brand.name} codes`} variant="secondary" icon="wand-sparkles" onPress={tryAll} />
              <Btn title="My model isn't listed, request it" variant="ghost" icon="send" onPress={() => nav.navigate('RequestModel', { category, brand: brand.name, model: dq || undefined })} />
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => nav.navigate('Match', { category, brand, model: item })}
              accessibilityRole="button"
              className="flex-row items-center justify-between border-b border-slate-200 py-4 active:opacity-60 dark:border-[#252d45]">
              <View className="flex-1 pr-3">
                <Txt variant="body" className="font-medium" numberOfLines={1}>{item.label ?? item.name}</Txt>
                <Txt variant="muted" numberOfLines={1}>
                  {[item.uncategorised ? 'Device type unknown' : null, ...new Set(item.configs.map(x => PROTOCOL_LABEL[x.protocol]))].filter(Boolean).join(' · ')}
                  {item.configs.length > 1 ? ` · ${item.configs.length} variants` : ''}
                </Txt>
              </View>
              <Icon name="chevron-right" size={18} color={c.muted} />
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
