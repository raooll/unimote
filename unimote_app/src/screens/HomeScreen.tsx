import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Icon } from '../components/Icon';
import { RoomsModal } from '../components/RoomsModal';
import { Btn, Card, Chip, EmptyState, Screen, Txt } from '../components/ui';
import { CATEGORY_ICONS, PROTOCOL_LABEL } from '../lib/categories';
import type { RootStackParamList } from '../navigation/types';
import { useLibrary } from '../store/library';
import { useColors } from '../theme';

export function HomeScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const c = useColors();
  const rooms = useLibrary(s => s.rooms);
  const remotes = useLibrary(s => s.remotes);
  const catalog = useLibrary(s => s.catalog);
  const [roomId, setRoomId] = useState<string>('all');
  const [roomsOpen, setRoomsOpen] = useState(false);

  const activeRoom = roomId === 'all' || roomId === 'none' || rooms.some(r => r.id === roomId) ? roomId : 'all';
  const visible = useMemo(
    () => remotes.filter(r => activeRoom === 'all' || (activeRoom === 'none' ? !r.roomId : r.roomId === activeRoom)),
    [remotes, activeRoom],
  );
  const hasUnassigned = remotes.some(r => !r.roomId);

  return (
    <Screen edges={['top']}>
      <View className="flex-row items-center justify-between pb-3 pt-2">
        <View>
          <Txt variant="title">Unimote</Txt>
          <Txt variant="muted">{remotes.length ? `${remotes.length} remote${remotes.length > 1 ? 's' : ''}` : 'One remote for everything'}</Txt>
        </View>
        <Pressable onPress={() => setRoomsOpen(true)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Manage rooms">
          <Icon name="door-open" size={24} color={c.muted} />
        </Pressable>
      </View>

      {remotes.length === 0 ? (
        <EmptyState
          icon="remote"
          title="Add your first remote"
          message="Pick your device type and brand. We'll find the right remote and test it with you. No account needed."
          action={<Btn title="Add a remote" icon="plus" onPress={() => nav.navigate('Nearby')} />}
        />
      ) : (
        <>
          {(rooms.length > 0 || hasUnassigned) && (
            <View className="mb-3">
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Chip label="All" selected={activeRoom === 'all'} onPress={() => setRoomId('all')} />
                {rooms.map(r => (
                  <Chip key={r.id} label={r.name} selected={activeRoom === r.id} onPress={() => setRoomId(r.id)} />
                ))}
                {hasUnassigned && rooms.length > 0 && (
                  <Chip label="No room" selected={activeRoom === 'none'} onPress={() => setRoomId('none')} />
                )}
              </ScrollView>
            </View>
          )}
          <FlatList
            data={visible}
            keyExtractor={r => r.id}
            numColumns={2}
            columnWrapperClassName="gap-3"
            contentContainerClassName="gap-3 pb-28"
            renderItem={({ item }) => {
              const remote = catalog[item.remoteId];
              return (
                <Pressable className="flex-1" onPress={() => nav.navigate('Remote', { id: item.id })} accessibilityRole="button" accessibilityLabel={item.name}>
                  <Card className="min-h-[132px] justify-between">
                    <View className="h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-500/15">
                      <Icon name={CATEGORY_ICONS[remote?.category ?? 'other']} size={22} color={c.accent} />
                    </View>
                    <View>
                      <Txt variant="heading" numberOfLines={1}>{item.name}</Txt>
                      <Txt variant="muted" numberOfLines={1}>
                        {remote ? PROTOCOL_LABEL[remote.protocol] : '…'}
                        {item.roomId ? ` · ${rooms.find(r => r.id === item.roomId)?.name ?? ''}` : ''}
                      </Txt>
                    </View>
                  </Card>
                </Pressable>
              );
            }}
            ListEmptyComponent={<Txt variant="muted" className="mt-8 text-center">No remotes in this room yet.</Txt>}
          />
          <View className="absolute bottom-6 right-4">
            <Pressable
              onPress={() => nav.navigate('Nearby')}
              accessibilityRole="button"
              accessibilityLabel="Add a remote"
              className="h-16 w-16 items-center justify-center rounded-full bg-indigo-600 shadow-lg active:bg-indigo-700">
              <Icon name="plus" size={28} color="#fff" />
            </Pressable>
          </View>
        </>
      )}
      <RoomsModal visible={roomsOpen} onClose={() => setRoomsOpen(false)} />
    </Screen>
  );
}
