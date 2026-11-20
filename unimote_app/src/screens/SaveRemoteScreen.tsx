import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { Btn, Card, Chip, ErrorView, Input, Loading, Screen, Txt } from '../components/ui';
import type { Remote } from '../api/types';
import { isAcRemote } from '../lib/acState';
import { PROTOCOL_LABEL } from '../lib/categories';
import { useAsync } from '../lib/hooks';
import type { RootStackParamList } from '../navigation/types';
import { useLibrary } from '../store/library';
import { ScrollView } from 'react-native';

/** Community code sets list every model they fit ("FTXS09LVJU, FTXS12LVJU, ..."); a short name is friendlier. */
function defaultName(remote: Remote): string {
  if (!isAcRemote(remote)) return remote.name;
  return `${remote.brand.name} AC`;
}

export function SaveRemoteScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { remoteId } = useRoute<NativeStackScreenProps<RootStackParamList, 'SaveRemote'>['route']>().params;
  const rooms = useLibrary(s => s.rooms);
  const addRoom = useLibrary(s => s.addRoom);
  const saveRemote = useLibrary(s => s.saveRemote);

  const { data: remote, loading, error, reload } = useAsync(() => api.remote(remoteId), [remoteId]);
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [newRoom, setNewRoom] = useState('');

  useEffect(() => {
    if (remote && !name) setName(defaultName(remote));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote]);

  if (loading && !remote) return <Screen><Loading label="Downloading remote…" /></Screen>;
  if (error || !remote) return <Screen><ErrorView message={error ?? 'Remote not found'} onRetry={reload} /></Screen>;

  const save = () => {
    let room = roomId;
    if (newRoom.trim()) room = addRoom(newRoom).id;
    const saved = saveRemote(remote, name || remote.name, room);
    nav.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'Remote', params: { id: saved.id } }] });
  };

  return (
    <Screen scroll>
      <Card className="mb-5 gap-1">
        <Txt variant="caption">Remote found</Txt>
        <Txt variant="heading">{remote.name}</Txt>
        <Txt variant="muted">
          {PROTOCOL_LABEL[remote.protocol]} · {isAcRemote(remote) ? 'Air conditioner, full control' : `${Object.keys(remote.signal_data.commands).length} buttons`}
        </Txt>
      </Card>

      <Input label="Name" value={name} onChangeText={setName} placeholder="Living room TV" />

      <Txt variant="caption" className="mb-2">Room (optional)</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
        <Chip label="No room" selected={!roomId && !newRoom} onPress={() => { setRoomId(null); setNewRoom(''); }} />
        {rooms.map(r => (
          <Chip key={r.id} label={r.name} selected={roomId === r.id && !newRoom} onPress={() => { setRoomId(r.id); setNewRoom(''); }} />
        ))}
      </ScrollView>
      <Input value={newRoom} onChangeText={setNewRoom} placeholder="…or create a new room, e.g. Bedroom" />

      <View className="mt-4">
        <Btn title="Save remote" icon="check" onPress={save} />
      </View>
    </Screen>
  );
}
