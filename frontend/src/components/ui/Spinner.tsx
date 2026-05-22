import { clsx } from 'clsx';

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={clsx('animate-spin rounded-full border-2 border-gray-300 border-t-blue-600', className ?? 'h-6 w-6')} />
  );
}

export function PageSpinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
