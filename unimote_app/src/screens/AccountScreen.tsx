import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api, ApiError } from '../api/client';
import { Btn, Card, Chip, Input, Screen, Txt } from '../components/ui';
import { useAuth } from '../store/auth';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import { syncNow } from '../sync/sync';

type Mode = 'in' | 'up' | 'forgot';

const errorText = (e: unknown) => {
  if (e instanceof ApiError) {
    const first = e.details && Object.entries(e.details)[0];
    return first ? `${first[0]} ${first[1][0]}` : e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
};

/** Optional account: everything in the app works without it. */
export function AccountScreen() {
  const nav = useNavigation();
  const user = useAuth(s => s.user);
  const toast = useUi(s => s.show);
  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const doSync = async (quiet = false) => {
    try {
      const r = await syncNow();
      const parts = [
        r.added.remotes && `${r.added.remotes} remote${r.added.remotes > 1 ? 's' : ''}`,
        r.added.scenes && `${r.added.scenes} scene${r.added.scenes > 1 ? 's' : ''}`,
        r.added.rooms && `${r.added.rooms} room${r.added.rooms > 1 ? 's' : ''}`,
      ].filter(Boolean);
      if (!quiet || parts.length) toast(parts.length ? `Synced. Added ${parts.join(', ')}.` : 'Everything is up to date.');
    } catch (e) {
      toast(`Sync failed: ${errorText(e)}`, 'error');
    }
  };

  const submit = async () => {
    setBusy(true);
    setNote(null);
    try {
      if (mode === 'forgot') {
        await api.requestPasswordReset(email.trim());
        setNote('If that email has an account, a reset link is on its way.');
        return;
      }
      const res =
        mode === 'up'
          ? await api.signUp({ email: email.trim(), password, name: name.trim() || undefined })
          : await api.signIn({ email: email.trim(), password });
      useAuth.getState().set(res.token, res.user);
      setPassword('');
      await doSync(true); // merge what is on this phone into the account
    } catch (e) {
      setNote(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await api.signOut().catch(() => {}); // revoke the token if we can; sign out locally regardless
    } finally {
      useAuth.getState().clear();
      setBusy(false);
    }
  };

  const deleteAccount = () =>
    Alert.alert('Delete your account?', 'Your account and its cloud backup are deleted permanently. Remotes stored on this phone are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete account',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteAccount();
            useAuth.getState().clear();
            toast('Account deleted');
            nav.goBack();
          } catch (e) {
            toast(errorText(e), 'error');
          }
        },
      },
    ]);

  if (user) {
    const count = useLibrary.getState().remotes.length;
    return (
      <Screen scroll>
        <Card className="mb-4 gap-1">
          <Txt variant="heading">{user.name || user.email}</Txt>
          {user.name ? <Txt variant="muted">{user.email}</Txt> : null}
          <Txt variant="muted" className="mt-2">{count} remote{count === 1 ? '' : 's'} on this phone. Pairing codes for your TVs stay on this phone only.</Txt>
        </Card>
        <View className="gap-2">
          <Btn title="Sync now" icon="refresh-cw" onPress={() => doSync()} />
          <Btn title="Sign out" variant="secondary" onPress={signOut} loading={busy} />
          <Btn title="Delete account" variant="danger" icon="trash-2" onPress={deleteAccount} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Txt variant="muted" className="mb-4">An account is optional. It backs up your rooms, remotes and scenes and syncs them between your devices.</Txt>
      <View className="mb-4 flex-row">
        <Chip label="Sign in" selected={mode === 'in'} onPress={() => setMode('in')} />
        <Chip label="Create account" selected={mode === 'up'} onPress={() => setMode('up')} />
      </View>
      {mode === 'up' && <Input label="Name (optional)" value={name} onChangeText={setName} autoCapitalize="words" />}
      <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
      {mode !== 'forgot' && <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" placeholder={mode === 'up' ? 'At least 8 characters' : undefined} />}
      {note ? <Txt variant="muted" className="mb-3">{note}</Txt> : null}
      <Btn title={mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'} onPress={submit} loading={busy} disabled={!email.trim() || (mode !== 'forgot' && password.length === 0)} />
      <View className="mt-2">
        <Btn title={mode === 'forgot' ? 'Back to sign in' : 'Forgot password?'} variant="ghost" onPress={() => { setNote(null); setMode(mode === 'forgot' ? 'in' : 'forgot'); }} />
      </View>
    </Screen>
  );
}
