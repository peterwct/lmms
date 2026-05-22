import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { amcApi } from '../../api/amc';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { PageSpinner } from '../../components/ui/Spinner';
import { ProductBadge } from '../../components/ProductBadge';
import { format } from 'date-fns';

const compLabel: Record<string, string> = { MAIN_AMC: 'Annual Maintenance Charge', SINKING_FUND: 'Sinking Fund (10%)', SERVICE_TAX: 'Service Tax (8%)', ROUNDING: 'Rounding Adjustment' };

export function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => amcApi.getInvoice(id!).then(r => r.data.data),
  });

  const handleDownload = async () => {
    const res = await amcApi.downloadInvoice(id!);
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `INV_${invoice?.invNo}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <PageSpinner />;
  if (!invoice) return <p className="text-gray-500">Invoice not found.</p>;

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold font-mono">{invoice.invNo}</h2>
          <p className="text-sm text-gray-500">{compLabel[invoice.invComponent]}</p>
        </div>
        <div className="flex items-center gap-3">
          <ProductBadge coCode={invoice.coCode} />
          <Badge color={invoice.isProcessed ? 'green' : 'gray'}>{invoice.isProcessed ? 'Processed' : 'Pending'}</Badge>
          <Button size="sm" variant="secondary" onClick={handleDownload}>
            <Download className="h-4 w-4" /> Download
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><p className="font-semibold text-gray-700">Invoice Details</p></CardHeader>
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {[
              ['Agreement', invoice.agreementNo],
              ['Membership', invoice.membershipNo],
              ['Member name', invoice.agreement?.member?.fullName],
              ['Invoice date', format(new Date(invoice.invDate), 'dd/MM/yyyy')],
              ['Due date', invoice.dueDate ? format(new Date(invoice.dueDate), 'dd/MM/yyyy') : '—'],
              ['Year seq.', invoice.invoiceYearSeq ?? '—'],
              ['Bill type', invoice.billType === 'N' ? 'Normal' : invoice.billType === 'F' ? 'Final' : invoice.billType === 'H' ? 'Ad-hoc' : 'Advance'],
              ['Doc No.', invoice.docNo || '—'],
              ['Print count', invoice.printCount],
              ['Processed at', invoice.processedAt ? format(new Date(invoice.processedAt), 'dd/MM/yyyy HH:mm') : '—'],
            ].map(([k, v]) => (
              <div key={k}><dt className="text-xs text-gray-500 uppercase tracking-wide">{k}</dt><dd className="mt-0.5 font-medium">{String(v ?? '—')}</dd></div>
            ))}
          </dl>
          <div className="mt-4 rounded-lg bg-blue-50 px-5 py-4 flex items-center justify-between">
            <span className="text-sm font-medium text-blue-800">{compLabel[invoice.invComponent]}</span>
            <span className="text-2xl font-bold text-blue-900">RM {parseFloat(invoice.invAmount).toFixed(2)}</span>
          </div>
          {invoice.totalPoints && (
            <p className="mt-2 text-xs text-gray-500">Based on {invoice.totalPoints} points</p>
          )}
        </CardBody>
      </Card>

      <div className="flex gap-3">
        <Link to="/amc/invoices" className="text-sm text-blue-600 hover:underline">← Back to invoices</Link>
        <Link to={`/agreements/${invoice.agreementId}`} className="text-sm text-blue-600 hover:underline">View agreement →</Link>
      </div>
    </div>
  );
}
