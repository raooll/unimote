import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import type { Brand } from '../api/types';
import { Icon } from '../components/Icon';
import { Btn, ErrorView, Loading, Screen, SearchBar, Txt } from '../components/ui';
import { useDebounced, usePaginated } from '../lib/hooks';
import type { RootStackParamList } from '../navigation/types';
import { useColors } from '../theme';

export function AddBrandScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { category } = useRoute<NativeStackScreenProps<RootStackParamList, 'AddBrand'>['route']>().params;
  const c = useColors();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);

  const { items, loading, error, loadMore, reload } = usePaginated<Brand>(
    async page => {
      const r = await api.brands({ category: category.slug, q: dq || undefined, page, per_page: 50 });
      return { items: r.brands, meta: r.meta };
    },
    [category.slug, dq],
  );

  return (
    <Screen>
      <Txt variant="heading" className="mb-3">Which brand is your {category.name.toLowerCase()}?</Txt>
      <SearchBar value={q} onChangeText={setQ} placeholder="Search brands" />
      {error && items.length === 0 ? (
        <ErrorView message={error} onRetry={reload} />
      ) : loading && items.length === 0 ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={b => b.slug}
          keyboardShouldPersistTaps="handled"
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={<Txt variant="muted" className="mt-8 text-center">No brands match “{dq}”.</Txt>}
          ListFooterComponent={
            <View className="gap-2 py-4">
              {loading ? <Loading /> : null}
              {!loading ? (
                <>
                  <Txt variant="muted" className="mb-1 text-center">Brand not listed?</Txt>
                  <Btn title={`Try common ${category.name.toLowerCase()} codes`} variant="secondary" icon="wand-sparkles" onPress={() => nav.navigate('Match', { category })} />
                  <Btn title="Request this brand" variant="secondary" icon="send" onPress={() => nav.navigate('RequestModel', { category, brand: dq || undefined })} />
                  <Btn title="Record your remote" variant="ghost" icon="radio" onPress={() => nav.navigate('Learn')} />
                </>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => nav.navigate('AddModel', { category, brand: item })}
              accessibilityRole="button"
              className="flex-row items-center justify-between border-b border-slate-200 py-4 active:opacity-60 dark:border-[#252d45]">
              <View className="flex-row items-center gap-3">
                <View className="h-10 w-10 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-500/15">
                  <Txt variant="heading" className="text-indigo-600 dark:text-indigo-300">{item.name.charAt(0).toUpperCase()}</Txt>
                </View>
                <Txt variant="body" className="font-medium">{item.name}</Txt>
              </View>
              <View className="flex-row items-center gap-2">
                {item.models_count ? <Txt variant="muted">{item.models_count}</Txt> : null}
                <Icon name="chevron-right" size={18} color={c.muted} />
              </View>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
