import * as Lucide from 'lucide-react-native';
import { useColors } from '../theme';

// Layout/category icons arrive from the API as kebab-case lucide names ("chevron-up").
const toPascal = (name: string) =>
  name
    .split('-')
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');

type IconComp = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

export function Icon({ name, size = 22, color, strokeWidth = 2 }: { name?: string; size?: number; color?: string; strokeWidth?: number }) {
  const c = useColors();
  const lib = Lucide as unknown as Record<string, IconComp>;
  const Comp = (name && lib[toPascal(name)]) || lib.CircleDot;
  return <Comp size={size} color={color ?? c.text} strokeWidth={strokeWidth} />;
}
