import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import type { NotificationAction } from '../lib/notificationActions';

interface NativeNotify {
  areEnabled(): Promise<boolean>;
  show(remoteKey: string, title: string, actions: NotificationAction[]): Promise<void>;
  hide(): Promise<void>;
  current(): Promise<string | null>;
}
const native: NativeNotify | undefined = Platform.OS === 'android' ? NativeModules.UnimoteNotify : undefined;

export const UnimoteNotify = {
  available: !!native,
  async current(): Promise<string | null> {
    return native ? native.current() : null;
  },
  /** Asks for the Android 13+ notification permission when needed; returns whether notifications can be shown. */
  async ensurePermission(): Promise<boolean> {
    if (!native) return false;
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as never);
    }
    return native.areEnabled();
  },
  async show(remoteKey: string, title: string, actions: NotificationAction[]): Promise<void> {
    if (!native) throw new Error('Notifications are not available in this build');
    await native.show(remoteKey, title, actions);
  },
  async hide(): Promise<void> {
    await native?.hide();
  },
};
