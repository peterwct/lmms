import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { FileDown, RefreshCw, Download } from 'lucide-react';
import { amcApi } from '../../api/amc';
import { apiError } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { PageSpinner } from '../../components/ui/Spinner';
import { format } from 'date-fns';

export function DayEnd() {
  const [runDate, setRunDate] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<{ message: string; files: { name: string; url: string }[]; summary: Record<string, { count: number; amount: number }> } | null>(null);
  const [error, setError] = useState('');

  const { data: history, isLoading: histLoading, refetch: refetchHistory } = useQuery({
    queryKey: ['dayend-history'],
    queryFn: () => amcApi.listDayEndHistory().then(r => r.data.data),
  });

  const genMut = useMutation({
    mutationFn: () => amcApi.generateDayEnd({ date: runDate ? new Date(runDate).toISOString() : undefined }),
    onSuccess: (res) => {
      setResult(res.data);
      refetchHistory();
      setError('');
    },
    onError: (err) => setError(apiError(err)),
  });

  const downloadFile = async (filename: string) => {
    const res = await amcApi.downloadDayEndFile(filename);
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Generator */}
      <Card>
        <CardHeader>
          <p className="font-semibold text-gray-700">Generate Day-End Files</p>
          <p className="text-xs text-gray-500 mt-0.5">Generates SL_IV CSV, email blast CSVs and hash totals for the selected date.</p>
        </CardHeader>
        <CardBody>
          <div className="flex items-end gap-4">
            <Input label="Invoice date" type="date" value={runDate} onChange={e => setRunDate(e.target.value)} className="w-44" />
            <Button onClick={() => { setResult(null); setError(''); genMut.mutate(); }} loading={genMut.isPending}>
              <FileDown className="h-4 w-4" /> Generate
            </Button>
          </div>

          {error && (
            <div className="mt-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {result && (
            <div className="mt-4 space-y-4">
              <p className="text-sm font-medium text-green-700">{result.message}</p>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(result.summary).map(([cc, s]) => (
                  <div key={cc} className="rounded-lg bg-blue-50 px-4 py-3">
                    <p className="text-xs font-semibold text-blue-600 uppercase">CoCode {cc}</p>
                    <p className="text-2xl font-bold text-blue-900 mt-0.5">{s.count}</p>
                    <p className="text-xs text-blue-700">agreements · RM {s.amount.toFixed(2)}</p>
                  </div>
                ))}
              </div>

              {/* Download links */}
              <div>
                <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Generated files</p>
                <div className="space-y-1.5">
                  {result.files.map(f => (
                    <div key={f.name} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
                      <span className="font-mono text-sm text-gray-700">{f.name}</span>
                      <button onClick={() => downloadFile(f.name)} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        <Download className="h-3.5 w-3.5" /> Download
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* History */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <p className="font-semibold text-gray-700">File History</p>
          <button onClick={() => refetchHistory()} className="text-gray-400 hover:text-gray-600">
            <RefreshCw className="h-4 w-4" />
          </button>
        </CardHeader>
        {histLoading ? <PageSpinner /> : (
          <div className="divide-y">
            {history?.length === 0 && (
              <p className="px-5 py-4 text-sm text-gray-400">No files generated yet.</p>
            )}
            {history?.map(f => (
              <div key={f.name} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="font-mono text-sm text-gray-800">{f.name}</p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(f.createdAt), 'dd/MM/yyyy HH:mm')} · {(f.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button onClick={() => downloadFile(f.name)} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                  <Download className="h-3.5 w-3.5" /> Download
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
