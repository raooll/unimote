import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { commandList } from '../lib/commands';
import { useLibrary } from '../store/library';
import { Btn, Chip, EmptyState, Txt } from './ui';

export interface PickedAction {
  remote: string;
  command: string;
  label: string;
}

/** Bottom sheet: choose one of the user's remotes, then one of its buttons. */
export function ActionPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (a: PickedAction) => void }) {
  const remotes = useLibrary(s => s.remotes);
  const catalog = useLibrary(s => s.catalog);
  const [remoteId, setRemoteId] = useState<string | null>(null);
  const saved = remotes.find(r => r.id === remoteId);
  const remote = saved ? catalog[saved.remoteId] : undefined;
  const close = () => {
    setRemoteId(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable className="flex-1 bg-black/50" onPress={close} />
      <View className="max-h-[75%] rounded-t-3xl bg-white p-5 pb-8 dark:bg-[#151b2e]">
        {remotes.length === 0 ? (
          <EmptyState icon="remote" title="No remotes yet" message="Add a remote first." />
        ) : !saved || !remote ? (
          <>
            <Txt variant="heading" className="mb-3">Which device?</Txt>
            <ScrollView>
              {remotes.map(r => (
                <Pressable key={r.id} onPress={() => setRemoteId(r.id)} accessibilityRole="button" className="border-b border-slate-200 py-3 dark:border-[#252d45]">
                  <Txt>{r.name}</Txt>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : (
          <>
            <Txt variant="heading" className="mb-3">{saved.name}: which button?</Txt>
            <ScrollView>
              <View className="flex-row flex-wrap">
                {commandList(remote).map(c => (
                  <Chip key={c.key} label={c.label} onPress={() => { onPick({ remote: saved.id, command: c.key, label: c.label }); close(); }} />
                ))}
              </View>
            </ScrollView>
            <Btn title="Back" variant="ghost" onPress={() => setRemoteId(null)} />
          </>
        )}
      </View>
    </Modal>
  );
}
