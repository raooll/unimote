import { useColorScheme } from 'nativewind';

export const palette = {
  dark: { bg: '#0b1020', card: '#151b2e', border: '#252d45', text: '#f1f5f9', muted: '#94a3b8', accent: '#818cf8', onAccent: '#ffffff', danger: '#f87171' },
  light: { bg: '#f5f6fb', card: '#ffffff', border: '#e2e5f0', text: '#0f172a', muted: '#64748b', accent: '#4f46e5', onAccent: '#ffffff', danger: '#dc2626' },
};

export function useColors() {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'light' ? palette.light : palette.dark;
}
