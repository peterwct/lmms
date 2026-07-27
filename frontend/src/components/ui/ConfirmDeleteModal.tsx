import { ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

// Standard delete confirmation for Resorts Setup CRUD. Replaces window.confirm so
// every function looks the same and, critically, so a FAILED delete has somewhere to
// report itself (window.confirm had no error surface — failures were silent).
//
// `rows` is the record summary shown in the grey box, so the user can see exactly
// what they are about to remove before confirming.

export interface SummaryRow {
  label: string;
  value: ReactNode;
}

interface Props {
  open: boolean;
  title: string;
  description: string;
  rows: SummaryRow[];
  error?: string;
  loading?: boolean;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDeleteModal({
  open, title, description, rows, error, loading,
  confirmLabel = 'Delete', onConfirm, onClose,
}: Props) {
  return (
    <Modal open={open} title={title} onClose={onClose} size="sm">
      <div className="space-y-3">
        <p className="text-sm text-gray-600">{description}</p>
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm space-y-1">
          {rows.map(r => (
            <div key={r.label}>
              <span className="text-gray-500">{r.label}:</span> {r.value}
            </div>
          ))}
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button variant="danger" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}
