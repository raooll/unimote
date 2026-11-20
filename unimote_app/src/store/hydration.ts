import { useEffect, useState } from 'react';
import { useAuth } from './auth';
import { useLibrary } from './library';
import { useSettings } from './settings';

const stores = [useLibrary, useSettings, useAuth];
const allHydrated = () => stores.every(s => s.persist.hasHydrated());

/** True once every persisted store has been read from AsyncStorage (avoids a flash of empty state). */
export function useHydrated(): boolean {
  const [ready, setReady] = useState(allHydrated);
  useEffect(() => {
    const check = () => setReady(allHydrated());
    const offs = stores.map(s => s.persist.onFinishHydration(check));
    check();
    return () => offs.forEach(off => off());
  }, []);
  return ready;
}
