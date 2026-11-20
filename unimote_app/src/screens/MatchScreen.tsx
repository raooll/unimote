import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import type { MatchCandidate } from '../api/types';
import { Icon } from '../components/Icon';
import { Btn, Card, EmptyState, ErrorView, Loading, Screen, Txt } from '../components/ui';
import { PROTOCOL_LABEL } from '../lib/categories';
import { useAsync } from '../lib/hooks';
import type { RootStackParamList } from '../navigation/types';
import { UnimoteIr } from '../native/UnimoteIr';
import { isIrSignal, transmitRaw } from '../transport/irDriver';
import { useUi } from '../store/ui';

/**
 * Code-matching wizard: fire a test signal from each candidate code set and ask the user
 * whether their device reacted. Answers are reported to the server (it improves ranking for everyone).
 */
export function MatchScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { category, brand, model } = useRoute<NativeStackScreenProps<RootStackParamList, 'Match'>['route']>().params;
  const toast = useUi(s => s.show);
  const [idx, setIdx] = useState(0);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [emitter, setEmitter] = useState<boolean | null>(null);

  const { data: candidates, loading, error, reload } = useAsync(
    () => api.match({ category: category.slug, brand: brand?.slug, model: model?.name }),
    [category.slug, brand?.slug, model?.id],
  );

  useEffect(() => {
    UnimoteIr.hasIrEmitter().then(setEmitter).catch(() => setEmitter(false));
  }, []);

  const requestIt = () => nav.navigate('RequestModel', { category, brand: brand?.name, model: model?.name });

  if (loading && !candidates) return <Screen><Loading label="Finding remotes…" /></Screen>;
  if (error && !candidates) return <Screen><ErrorView message={error} onRetry={reload} /></Screen>;
  if (!candidates || candidates.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="search-x"
          title="No remote found"
          message={`We don't have a ${brand ? `${brand.name} ` : ''}${category.name.toLowerCase()} remote yet. Tell us what you have and we'll add it.`}
          action={
            <View className="w-full gap-2">
              <Btn title="Request this device" icon="send" onPress={requestIt} />
              <Btn title="Back" variant="secondary" onPress={() => nav.goBack()} />
            </View>
          }
        />
      </Screen>
    );
  }

  if (idx >= candidates.length) {
    return (
      <Screen>
        <EmptyState
          icon="circle-help"
          title="None of the codes worked"
          message="Make sure the device is on and the phone points at it. If it still doesn't react, we may not have your remote yet: ask us to add it, or record it yourself."
          action={
            <View className="w-full gap-2">
              <Btn title="Start over" icon="refresh-cw" onPress={() => { setIdx(0); setSent(false); }} />
              {brand ? <Btn title={`Try common ${category.name.toLowerCase()} codes`} variant="secondary" icon="wand-sparkles" onPress={() => nav.replace('Match', { category })} /> : null}
              <Btn title="Request this device" variant="secondary" icon="send" onPress={requestIt} />
              <Btn title="Record your remote" variant="ghost" icon="radio" onPress={() => nav.navigate('Learn')} />
              <Btn title="Back" variant="secondary" onPress={() => nav.goBack()} />
            </View>
          }
        />
      </Screen>
    );
  }

  const cand: MatchCandidate = candidates[idx];
  const testable = cand.protocol === 'ir' && !!cand.test && isIrSignal(cand.test.signal);
  const canFire = testable && emitter !== false;

  const use = (worked?: boolean) => {
    if (worked !== undefined) api.report(cand.id, worked).catch(() => {});
    nav.navigate('SaveRemote', { remoteId: cand.id });
  };

  const sendTest = async () => {
    if (!cand.test || !isIrSignal(cand.test.signal)) return;
    setSending(true);
    const res = await transmitRaw(cand.test.signal);
    setSending(false);
    if (res.ok) setSent(true);
    else toast(res.message, 'error');
  };

  const next = () => {
    api.report(cand.id, false).catch(() => {});
    setSent(false);
    setIdx(i => i + 1);
  };

  return (
    <Screen scroll>
      <Txt variant="caption" className="mb-1">Code set {idx + 1} of {candidates.length}</Txt>
      <Txt variant="title" className="mb-1">{brand ? `${brand.name} ` : ''}{cand.model}</Txt>
      <Txt variant="muted" className="mb-6">
        {PROTOCOL_LABEL[cand.protocol]}
        {cand.success_rate != null ? ` · worked for ${Math.round(cand.success_rate * 100)}% of people` : ''}
        {cand.shared_by ? ` · also used by ${cand.shared_by} other model${cand.shared_by === 1 ? '' : 's'}` : ''}
      </Txt>

      {canFire ? (
        <>
          <Card className="items-center gap-4 py-8">
            <Txt variant="muted" className="text-center">
              Point your phone at the {category.name.toLowerCase()} and tap the button. We'll send “{cand.test!.command.replace(/_/g, ' ').toLowerCase()}”.
            </Txt>
            <Pressable
              onPress={sendTest}
              disabled={sending}
              accessibilityRole="button"
              accessibilityLabel="Send test signal"
              className="h-28 w-28 items-center justify-center rounded-full bg-indigo-600 active:bg-indigo-700">
              <Icon name={sending ? 'loader' : 'radio-tower'} size={40} color="#fff" />
            </Pressable>
            <Txt variant="muted">{sent ? 'Sent. Tap again to resend.' : 'Tap to send test'}</Txt>
          </Card>
          {sent && (
            <View className="mt-5 gap-2">
              <Txt variant="heading" className="text-center">Did your device react?</Txt>
              <Btn title="Yes, it worked" icon="check" onPress={() => use(true)} />
              <Btn title="No, try the next code" variant="secondary" icon="x" onPress={next} />
            </View>
          )}
        </>
      ) : (
        <Card className="gap-3">
          <Txt variant="body">
            {cand.protocol !== 'ir'
              ? `${PROTOCOL_LABEL[cand.protocol]} remotes are paired with your device when you first use them, so there is no test signal.`
              : emitter === false
                ? "This phone has no infrared blaster, so we can't test the code here. You can still save this remote and use it with a Wi-Fi IR hub."
                : 'Checking your phone…'}
          </Txt>
          <Btn title="Use this remote" icon="check" onPress={() => use()} />
        </Card>
      )}

      <View className="mt-6 gap-2">
        {!canFire || !sent ? <Btn title="Try next code set" variant="ghost" onPress={() => { setSent(false); setIdx(i => i + 1); }} /> : null}
        {canFire && !sent ? <Btn title="Skip the test, use this one" variant="ghost" onPress={() => use()} /> : null}
      </View>
    </Screen>
  );
}
