import { useEffect, useLayoutEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { Icon } from '../components/Icon';
import { AcPanel } from '../components/remote/AcPanel';
import { RemoteRenderer } from '../components/remote/RemoteRenderer';
import { isAcRemote, type AcState } from '../lib/acState';
import { Btn, Card, Chip, Input, Loading, Screen, Txt } from '../components/ui';
import { PROTOCOL_LABEL } from '../lib/categories';
import type { RootStackParamList } from '../navigation/types';
import { pickNotificationActions } from '../lib/notificationActions';
import { UnimoteIr } from '../native/UnimoteIr';
import { UnimoteNotify } from '../native/UnimoteNotify';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { useColors } from '../theme';
import { hubFromSettings } from '../transport/irHub';
import { needsDeviceSetup, sendCommand } from '../transport/dispatcher';

const isConnected = (s: Record<string, unknown>) => !!(s.host || s.deviceId || s.address);

export function RemoteScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { id } = useRoute<NativeStackScreenProps<RootStackParamList, 'Remote'>['route']>().params;
  const c = useColors();
  const saved = useLibrary(s => s.remotes.find(r => r.id === id));
  const remote = useLibrary(s => (saved ? s.catalog[saved.remoteId] : undefined));
  const cacheRemote = useLibrary(s => s.cacheRemote);
  const updateRemote = useLibrary(s => s.updateRemote);
  const toast = useUi(s => s.show);
  const [menu, setMenu] = useState(false);
  const [emitter, setEmitter] = useState<boolean | null>(null);

  useEffect(() => {
    UnimoteIr.hasIrEmitter().then(setEmitter).catch(() => setEmitter(false));
  }, []);

  // Refresh the cached definition in the background (cheap 304 when unchanged is handled server-side by version).
  useEffect(() => {
    if (!saved || saved.remoteId < 0) return; // recorded remotes live only on this phone
    api.remote(saved.remoteId).then(r => remote && r.version !== remote.version && cacheRemote(r)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.remoteId]);

  useLayoutEffect(() => {
    nav.setOptions({
      title: saved?.name ?? 'Remote',
      headerRight: () => (
        <Pressable onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel="Remote options" hitSlop={12}>
          <Icon name="ellipsis" size={24} color={c.text} />
        </Pressable>
      ),
    });
  }, [nav, saved?.name, c.text]);

  if (!saved || !remote) {
    return <Screen><Loading label="Loading…" /></Screen>;
  }

  const press = async (command: string) => {
    const res = await sendCommand(remote, command, {
      settings: saved.settings,
      // Read the latest settings so a token learned mid-session is never overwritten by a stale copy.
      updateSettings: patch => {
        const cur = useLibrary.getState().remotes.find(r => r.id === id)?.settings ?? {};
        updateRemote(id, { settings: { ...cur, ...patch } });
      },
    });
    if (!res.ok) {
      toast(res.message, 'error');
      if (res.code === 'needs_setup') nav.navigate('ConnectDevice', { id });
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerClassName="pb-10 pt-1" showsVerticalScrollIndicator={false}>
        {remote.protocol === 'ir' && emitter === false && !hubFromSettings(saved.settings) && (
          <Card className="mb-3 flex-row items-center gap-3 border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10">
            <Icon name="triangle-alert" size={20} color="#d97706" />
            <Txt variant="muted" className="flex-1">This phone has no IR blaster. Use a Wi-Fi IR hub to send these buttons.</Txt>
            <Btn title="Set up hub" onPress={() => nav.navigate('ConnectDevice', { id })} />
          </Card>
        )}
        {needsDeviceSetup(remote) && !isConnected(saved.settings) && (
          <Card className="mb-3 flex-row items-center gap-3">
            <Icon name="wifi" size={20} color={c.accent} />
            <Txt variant="muted" className="flex-1">Connect to your device to start controlling it.</Txt>
            <Btn title="Connect" onPress={() => nav.navigate('ConnectDevice', { id })} />
          </Card>
        )}
        {isAcRemote(remote) ? (
          <AcPanel
            remote={remote}
            state={saved.settings.ac as AcState | undefined}
            onState={ac => {
              const cur = useLibrary.getState().remotes.find(r => r.id === id)?.settings ?? {};
              updateRemote(id, { settings: { ...cur, ac } });
            }}
            onSend={press}
          />
        ) : (
          <RemoteRenderer remote={remote} onPress={press} />
        )}
        <Txt variant="muted" className="mt-6 text-center">
          {remote.name} · {PROTOCOL_LABEL[remote.protocol]}
        </Txt>
      </ScrollView>
      <ManageModal visible={menu} onClose={() => setMenu(false)} id={id} onDeleted={() => nav.goBack()} />
    </Screen>
  );
}

function ManageModal({ visible, onClose, id, onDeleted }: { visible: boolean; onClose: () => void; id: string; onDeleted: () => void }) {
  const saved = useLibrary(s => s.remotes.find(r => r.id === id));
  const rooms = useLibrary(s => s.rooms);
  const update = useLibrary(s => s.updateRemote);
  const remove = useLibrary(s => s.removeRemote);
  const definition = useLibrary(s => (saved ? s.catalog[saved.remoteId] : undefined));
  const toast = useUi(s => s.show);
  const [pinned, setPinned] = useState(false);
  const [name, setName] = useState(saved?.name ?? '');
  useEffect(() => {
    if (visible) UnimoteNotify.current().then(k => setPinned(k === id)).catch(() => setPinned(false));
  }, [visible, id]);
  useEffect(() => setName(saved?.name ?? ''), [saved?.name, visible]);
  if (!saved) return null;

  const notifyActions = definition ? pickNotificationActions(definition) : [];
  const togglePinned = async () => {
    try {
      if (pinned) {
        await UnimoteNotify.hide();
        setPinned(false);
        return;
      }
      if (!(await UnimoteNotify.ensurePermission())) return toast('Allow notifications for Unimote in Settings first.');
      await UnimoteNotify.show(id, saved!.name, notifyActions);
      setPinned(true);
      toast('Pinned to your notification shade.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not change the notification.');
    }
  };

  const confirmDelete = () =>
    Alert.alert('Delete remote?', `“${saved.name}” will be removed from this phone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { onClose(); remove(id); onDeleted(); } },
    ]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50" onPress={onClose} />
      <View className="gap-3 rounded-t-3xl bg-white p-5 pb-8 dark:bg-[#151b2e]">
        <Txt variant="heading">Remote options</Txt>
        <Input label="Name" value={name} onChangeText={setName} onEndEditing={() => name.trim() && update(id, { name: name.trim() })} />
        <Txt variant="caption">Room</Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Chip label="No room" selected={!saved.roomId} onPress={() => update(id, { roomId: null })} />
          {rooms.map(r => (
            <Chip key={r.id} label={r.name} selected={saved.roomId === r.id} onPress={() => update(id, { roomId: r.id })} />
          ))}
        </ScrollView>
        <View className="mt-2 gap-2">
          {UnimoteNotify.available && notifyActions.length ? (
            <Btn title={pinned ? 'Remove from notifications' : 'Show in notifications'} variant="secondary" icon="bell" onPress={togglePinned} />
          ) : null}
          <Btn title="Done" onPress={() => { if (name.trim()) update(id, { name: name.trim() }); onClose(); }} />
          <Btn title="Delete remote" variant="danger" icon="trash-2" onPress={confirmDelete} />
        </View>
      </View>
    </Modal>
  );
}
