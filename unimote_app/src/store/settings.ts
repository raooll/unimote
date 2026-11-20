import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_API_URL } from '../config';
import { uuid } from '../lib/uuid';

export type ThemeMode = 'system' | 'dark' | 'light';

interface SettingsState {
  /** Anonymous id of this install; lets guests send feedback without an account. */
  installId: string;
  theme: ThemeMode;
  apiUrl: string;
  setTheme: (t: ThemeMode) => void;
  setApiUrl: (url: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    set => ({
      installId: uuid(),
      theme: 'dark',
      apiUrl: DEFAULT_API_URL,
      setTheme: theme => set({ theme }),
      setApiUrl: apiUrl => set({ apiUrl: apiUrl.trim().replace(/\/+$/, '') || DEFAULT_API_URL }),
    }),
    { name: 'unimote.settings', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
