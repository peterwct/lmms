interface RecordCountProps {
  total?: number;
  loading?: boolean;
}

export function RecordCount({ total, loading }: RecordCountProps) {
  if (loading || total === undefined) return null;
  return (
    <p className="text-sm text-gray-500">
      <span className="font-semibold text-gray-800">{total.toLocaleString()}</span>
      {' '}record{total !== 1 ? 's' : ''} found
    </p>
  );
}
