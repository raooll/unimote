import { create } from 'zustand';

interface UiState {
  toast: { id: number; message: string; kind: 'info' | 'error' } | null;
  show: (message: string, kind?: 'info' | 'error') => void;
  hide: () => void;
}

let counter = 0;
export const useUi = create<UiState>(set => ({
  toast: null,
  show: (message, kind = 'info') => set({ toast: { id: ++counter, message, kind } }),
  hide: () => set({ toast: null }),
}));
