import { clsx } from 'clsx';

type Color = 'gray' | 'green' | 'yellow' | 'orange' | 'red' | 'blue' | 'indigo' | 'purple' | 'amber';

const colorCls: Record<Color, string> = {
  gray:   'bg-gray-100 text-gray-700',
  green:  'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  orange: 'bg-orange-100 text-orange-700',
  red:    'bg-red-100 text-red-700',
  blue:   'bg-blue-100 text-blue-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  purple: 'bg-purple-100 text-purple-700',
  amber:  'bg-amber-100 text-amber-700',
};

export function Badge({ children, color = 'gray', className }: { children: React.ReactNode; color?: Color; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', colorCls[color], className)}>
      {children}
    </span>
  );
}
