import { useEffect } from 'react';
import { Linking } from 'react-native';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { parseDeepLink } from '../lib/deeplink';
import { publishSceneShortcuts } from '../native/UnimoteShortcuts';
import { runSavedScene } from '../scenes/run';
import { useLibrary } from '../store/library';
import { useUi } from '../store/ui';
import type { RootStackParamList } from './types';

/**
 * Handles unimote:// links (app shortcuts, Quick Settings tile) and keeps the icon shortcuts in step with the scenes.
 * Call once inside the app after the stores have loaded.
 */
export function useDeepLinks(nav: NavigationContainerRefWithCurrent<RootStackParamList>) {
  useEffect(() => {
    // A link that launches the app arrives before the navigator has mounted, so give it a moment.
    const ready = async () => {
      for (let i = 0; i < 30 && !nav.isReady(); i++) await new Promise<void>(r => setTimeout(r, 100));
      return nav.isReady();
    };
    const handle = async (url: string | null | undefined) => {
      const link = parseDeepLink(url);
      if (!link || !(await ready())) return;
      if (link.type === 'remote') {
        if (useLibrary.getState().remotes.some(r => r.id === link.id)) nav.navigate('Remote', { id: link.id });
      } else if (link.type === 'scene') {
        const scene = useLibrary.getState().scenes.find(s => s.id === link.id);
        const toast = useUi.getState().show;
        if (!scene) return toast('That scene no longer exists.', 'error');
        const { message, ok } = await runSavedScene(scene);
        toast(message, ok ? 'info' : 'error');
      }
    };

    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', e => void handle(e.url));

    let last = '';
    const publish = () => {
      const scenes = useLibrary.getState().scenes;
      const key = JSON.stringify(scenes.map(s => [s.id, s.name]));
      if (key !== last) {
        last = key;
        void publishSceneShortcuts(scenes);
      }
    };
    publish();
    const unsub = useLibrary.subscribe(publish);

    return () => {
      sub.remove();
      unsub();
    };
  }, [nav]);
}
