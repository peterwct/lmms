import { Badge } from './ui/Badge';
import type { AgreementStatus } from '../types';

const cfg: Record<AgreementStatus, { label: string; color: 'green' | 'yellow' | 'orange' | 'red' }> = {
  NA: { label: 'Active',             color: 'green'  },
  SU: { label: 'Suspended',          color: 'yellow' },
  PT: { label: 'Pending Termination',color: 'orange' },
  TM: { label: 'Terminated',         color: 'red'    },
};

export function AgreementStatusBadge({ status }: { status: AgreementStatus }) {
  const { label, color } = cfg[status] ?? cfg.NA;
  return <Badge color={color}>{label}</Badge>;
}
