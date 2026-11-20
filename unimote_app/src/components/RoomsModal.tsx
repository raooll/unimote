import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { useLibrary } from '../store/library';
import { useColors } from '../theme';
import { Icon } from './Icon';
import { Btn, Card, Input, Txt } from './ui';

/** Create, rename and delete rooms. Deleting a room keeps its remotes (they become "No room"). */
export function RoomsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useColors();
  const rooms = useLibrary(s => s.rooms);
  const remotes = useLibrary(s => s.remotes);
  const addRoom = useLibrary(s => s.addRoom);
  const renameRoom = useLibrary(s => s.renameRoom);
  const removeRoom = useLibrary(s => s.removeRoom);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const add = () => {
    if (!name.trim()) return;
    addRoom(name);
    setName('');
  };
  const confirmRemove = (id: string, label: string) =>
    Alert.alert(`Delete “${label}”?`, 'Its remotes stay on your phone and move to “No room”.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeRoom(id) },
    ]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50" onPress={onClose} />
      <View className="max-h-[80%] gap-3 rounded-t-3xl bg-white p-5 pb-8 dark:bg-[#151b2e]">
        <Txt variant="heading">Rooms</Txt>
        <ScrollView keyboardShouldPersistTaps="handled">
          {rooms.length === 0 && <Txt variant="muted" className="mb-2">No rooms yet. Add one below, e.g. “Living room”.</Txt>}
          {rooms.map(r =>
            editing === r.id ? (
              <View key={r.id} className="mb-2">
                <Input value={draft} onChangeText={setDraft} autoFocus />
                <View className="flex-row gap-2">
                  <Btn title="Save" className="flex-1" onPress={() => { if (draft.trim()) renameRoom(r.id, draft); setEditing(null); }} />
                  <Btn title="Cancel" variant="secondary" className="flex-1" onPress={() => setEditing(null)} />
                </View>
              </View>
            ) : (
              <Card key={r.id} className="mb-2 flex-row items-center gap-3">
                <View className="flex-1">
                  <Txt>{r.name}</Txt>
                  <Txt variant="muted">{remotes.filter(x => x.roomId === r.id).length} remotes</Txt>
                </View>
                <Pressable onPress={() => { setEditing(r.id); setDraft(r.name); }} hitSlop={8} accessibilityLabel={`Rename ${r.name}`}><Icon name="pencil" size={20} color={c.muted} /></Pressable>
                <Pressable onPress={() => confirmRemove(r.id, r.name)} hitSlop={8} accessibilityLabel={`Delete ${r.name}`}><Icon name="trash-2" size={20} color="#ef4444" /></Pressable>
              </Card>
            ),
          )}
        </ScrollView>
        <Input label="New room" value={name} onChangeText={setName} placeholder="Bedroom" onSubmitEditing={add} />
        <Btn title="Add room" icon="plus" onPress={add} disabled={!name.trim()} />
        <Btn title="Done" variant="ghost" onPress={onClose} />
      </View>
    </Modal>
  );
}
