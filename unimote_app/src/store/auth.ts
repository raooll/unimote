import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '../api/types';

// Login is OPTIONAL. With no token the app works fully as a guest; an account only adds cloud sync.
interface AuthState {
  token: string | null;
  user: User | null;
  set: (token: string, user: User) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    set => ({
      token: null,
      user: null,
      set: (token, user) => set({ token, user }),
      clear: () => set({ token: null, user: null }),
    }),
    { name: 'unimote.auth', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
