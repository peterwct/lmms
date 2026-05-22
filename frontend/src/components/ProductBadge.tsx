import { Badge } from './ui/Badge';

const cfg: Record<string, { label: string; color: 'indigo' | 'blue' | 'amber' }> = {
  '03': { label: 'LHC-03', color: 'indigo' },
  '15': { label: 'LHC-15', color: 'blue'   },
  '02': { label: 'CP',     color: 'amber'  },
};

export function ProductBadge({ coCode }: { coCode: string }) {
  const { label, color } = cfg[coCode] ?? { label: coCode, color: 'indigo' };
  return <Badge color={color}>{label}</Badge>;
}
