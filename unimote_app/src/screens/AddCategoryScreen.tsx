import { FlatList, Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { Icon } from '../components/Icon';
import { Btn, Card, ErrorView, Loading, Screen, Txt } from '../components/ui';
import { useAsync } from '../lib/hooks';
import type { RootStackParamList } from '../navigation/types';
import { useColors } from '../theme';

export function AddCategoryScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const c = useColors();
  const { data, loading, error, reload } = useAsync(() => api.categories(), []);

  if (loading && !data) return <Screen><Loading label="Loading device types…" /></Screen>;
  if (error && !data) return <Screen><ErrorView message={error} onRetry={reload} /></Screen>;

  return (
    <Screen>
      <Txt variant="heading" className="mb-1">What do you want to control?</Txt>
      <Txt variant="muted" className="mb-4">Choose a device type</Txt>
      <FlatList
        data={data}
        numColumns={2}
        keyExtractor={x => x.slug}
        columnWrapperClassName="gap-3"
        contentContainerClassName="gap-3 pb-8"
        ListFooterComponent={<Btn title="Can’t find it? Record your remote" icon="radio" variant="ghost" onPress={() => nav.navigate('Learn')} />}
        renderItem={({ item }) => (
          <Pressable className="flex-1" onPress={() => nav.navigate('AddBrand', { category: item })} accessibilityRole="button" accessibilityLabel={item.name}>
            <Card className="min-h-[108px] justify-between">
              <Icon name={item.icon} size={26} color={c.accent} />
              <View>
                <Txt variant="body" className="font-semibold" numberOfLines={1}>{item.name}</Txt>
                <Txt variant="muted">{item.models_count} models</Txt>
              </View>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
