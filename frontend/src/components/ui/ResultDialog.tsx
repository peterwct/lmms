import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

// Standard outcome acknowledgement for Resorts Setup CRUD (add / edit / delete).
// Deliberately a dialog, not an auto-dismissing toast: the user must click OK, so a
// confirmation can never be missed. Pass a null message to hide.
//
// Convention: message names the record that changed, e.g.
//   "Maintenance record added - L-10024 unit A1 (3BR), 2027-01-04 to 2027-01-05."

interface Props {
  message: string | null;
  onClose: () => void;
  title?: string;
  variant?: 'success' | 'error';
}

export function ResultDialog({ message, onClose, title, variant = 'success' }: Props) {
  const ok = variant === 'success';
  const Icon = ok ? CheckCircle2 : AlertCircle;

  return (
    <Modal
      open={!!message}
      title={title ?? (ok ? 'Success' : 'Failed')}
      onClose={onClose}
      size="sm"
    >
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-6 w-6 shrink-0 ${ok ? 'text-green-600' : 'text-red-600'}`} />
        <p className="text-sm text-gray-700">{message}</p>
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={onClose} autoFocus>OK</Button>
      </div>
    </Modal>
  );
}
