import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';
import { writeAudit } from '../../utils/audit';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

interface StatusCounts { na: number; su: number; pt: number; tm: number }

export interface PbsPayRow {
  year: number;
  month: number;
  k19: StatusCounts & { total: number; totalRM: number };
  k21: StatusCounts & { total: number; totalRM: number };
}

async function buildRows(): Promise<PbsPayRow[]> {
  const rows: Array<{ year: number; month: number; scheme_type: string; status: string; cnt: bigint }> = await prisma.$queryRaw`
    SELECT
      EXTRACT(YEAR  FROM p."paybackDate")::int AS year,
      EXTRACT(MONTH FROM p."paybackDate")::int AS month,
      p."schemeType" AS scheme_type,
      COALESCE(tf."acctClassify", a."acctClassify") AS status,
      COUNT(*)::bigint AS cnt
    FROM "PbsScheme" p
    JOIN "Agreement" a ON a.id = p."agreementId"
    LEFT JOIN "Agreement" tf
      ON a."transferFlag" = 'TT'
      AND tf."agreementNo" = a."agreementNo"
      AND tf."transferFlag" = 'TF'
    WHERE p."paybackDate" IS NOT NULL
      AND p."schemeType" IN ('19K', '21K')
      AND p."pbsIndc" = true
      AND p."claimIndc" = false
    GROUP BY year, month, scheme_type, status
    ORDER BY year, month, scheme_type, status
  `;

  const map = new Map<string, { k19: StatusCounts; k21: StatusCounts }>();

  for (const r of rows) {
    const key = `${r.year}-${String(r.month).padStart(2, '0')}`;
    if (!map.has(key)) {
      map.set(key, {
        k19: { na: 0, su: 0, pt: 0, tm: 0 },
        k21: { na: 0, su: 0, pt: 0, tm: 0 },
      });
    }
    const entry = map.get(key)!;
    const bucket = r.scheme_type === '19K' ? entry.k19 : entry.k21;
    const count = Number(r.cnt);

    if (r.status === 'NA') bucket.na += count;
    else if (r.status === 'SU') bucket.su += count;
    else if (r.status === 'PT') bucket.pt += count;
    else if (r.status === 'TM') bucket.tm += count;
  }

  const keys = Array.from(map.keys()).sort();
  return keys.map(key => {
    const [y, m] = key.split('-').map(Number);
    const e = map.get(key)!;
    const k19Total = e.k19.na + e.k19.su + e.k19.pt + e.k19.tm;
    const k21Total = e.k21.na + e.k21.su + e.k21.pt + e.k21.tm;
    return {
      year: y,
      month: m,
      k19: { ...e.k19, total: k19Total, totalRM: k19Total * 19000 },
      k21: { ...e.k21, total: k21Total, totalRM: k21Total * 21000 },
    };
  });
}

// ── Preview ───────────────────────────────────────────────────────────────────

export async function previewPbsPayByMonth(req: Request, res: Response): Promise<void> {
  const rows = await buildRows();

  const totals = {
    k19: { na: 0, su: 0, pt: 0, tm: 0, total: 0 },
    k21: { na: 0, su: 0, pt: 0, tm: 0, total: 0 },
  };
  for (const r of rows) {
    totals.k19.na += r.k19.na; totals.k19.su += r.k19.su;
    totals.k19.pt += r.k19.pt; totals.k19.tm += r.k19.tm;
    totals.k19.total += r.k19.total;
    totals.k21.na += r.k21.na; totals.k21.su += r.k21.su;
    totals.k21.pt += r.k21.pt; totals.k21.tm += r.k21.tm;
    totals.k21.total += r.k21.total;
  }

  res.json({ data: rows, meta: { totalRows: rows.length, totals } });
}

// ── Generate Text ─────────────────────────────────────────────────────────────

function pad(s: string, w: number, align: 'left' | 'right' = 'right'): string {
  if (align === 'left') return s.padEnd(w);
  return s.padStart(w);
}

function fmtN(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtRM(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function generatePbsPayByMonth(req: Request, res: Response): Promise<void> {
  const rows = await buildRows();
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
  const monthName = MONTH_NAMES[now.getMonth() + 1];

  const W = 210;
  const SEP = '-'.repeat(W);

  const lines: string[] = [];
  lines.push(pad(`Date: ${dateStr}`, W));
  const title = `PBS Payback Report II For ${monthName} ${now.getFullYear()}`;
  const titlePad = Math.max(0, Math.floor((W - title.length) / 2));
  lines.push(' '.repeat(titlePad) + title);
  lines.push(SEP);

  // Header row 1: section labels
  lines.push(
    pad('Payback Period', 16) +
    pad('<-------------------------------RM19K Pay Back Scheme-------------------------------------------------->', 97) +
    '    ' +
    pad('<--------------------------------RM21K Payback Scheme------------------------------------------------>', 93)
  );
  lines.push(SEP);

  // Header row 2: column labels
  const hdr =
    pad('Year', 4) + '     ' + pad('Month', 5) +
    pad('NA/RA', 7) + pad('Total (RM)', 15) +
    pad('SU', 7) + pad('Total (RM)', 15) +
    pad('PT', 7) + pad('Total (RM)', 15) +
    pad('TM', 7) + pad('Total (RM)', 15) +
    pad('Ttl 19K', 8) + pad('Total (RM)', 15) +
    '    ' +
    pad('NA/RA', 7) + pad('Total (RM)', 14) +
    pad('SU', 7) + pad('Total (RM)', 15) +
    pad('PT', 7) + pad('Total (RM)', 15) +
    pad('TM', 7) + pad('Total (RM)', 15) +
    pad('Ttl 21K', 8) + pad('Total (RM)', 15);
  lines.push(hdr);
  lines.push(SEP);

  // Data rows
  for (const r of rows) {
    const line =
      pad(String(r.year), 4) + '     ' + pad(String(r.month).padStart(2, '0'), 5) +
      pad(fmtN(r.k19.na), 7) + pad(fmtRM(r.k19.na * 19000), 15) +
      pad(fmtN(r.k19.su), 7) + pad(fmtRM(r.k19.su * 19000), 15) +
      pad(fmtN(r.k19.pt), 7) + pad(fmtRM(r.k19.pt * 19000), 15) +
      pad(fmtN(r.k19.tm), 7) + pad(fmtRM(r.k19.tm * 19000), 15) +
      pad(fmtN(r.k19.total), 8) + pad(fmtRM(r.k19.totalRM), 15) +
      '    ' +
      pad(fmtN(r.k21.na), 7) + pad(fmtRM(r.k21.na * 21000), 14) +
      pad(fmtN(r.k21.su), 7) + pad(fmtRM(r.k21.su * 21000), 15) +
      pad(fmtN(r.k21.pt), 7) + pad(fmtRM(r.k21.pt * 21000), 15) +
      pad(fmtN(r.k21.tm), 7) + pad(fmtRM(r.k21.tm * 21000), 15) +
      pad(fmtN(r.k21.total), 8) + pad(fmtRM(r.k21.totalRM), 15);
    lines.push(line);
  }

  lines.push(SEP);

  // Totals row (counts only, no amounts)
  const t19 = { na: 0, su: 0, pt: 0, tm: 0, total: 0 };
  const t21 = { na: 0, su: 0, pt: 0, tm: 0, total: 0 };
  for (const r of rows) {
    t19.na += r.k19.na; t19.su += r.k19.su; t19.pt += r.k19.pt; t19.tm += r.k19.tm; t19.total += r.k19.total;
    t21.na += r.k21.na; t21.su += r.k21.su; t21.pt += r.k21.pt; t21.tm += r.k21.tm; t21.total += r.k21.total;
  }

  const totalLine =
    pad('Total :', 14) +
    pad(fmtN(t19.na), 7) + pad('', 15) +
    pad(fmtN(t19.su), 7) + pad('', 15) +
    pad(fmtN(t19.pt), 7) + pad('', 15) +
    pad(fmtN(t19.tm), 7) + pad('', 15) +
    pad(fmtN(t19.total), 8) + pad('', 15) +
    '    ' +
    pad(fmtN(t21.na), 7) + pad('', 14) +
    pad(fmtN(t21.su), 7) + pad('', 15) +
    pad(fmtN(t21.pt), 7) + pad('', 15) +
    pad(fmtN(t21.tm), 7) + pad('', 15) +
    pad(fmtN(t21.total), 8) + pad('', 15);
  lines.push(totalLine);
  lines.push(SEP);

  await writeAudit({
    userId: req.user!.id,
    action: `Generated PBS Pay By Month/Year report: ${rows.length} periods`,
    actionType: 'CREATE',
    targetType: 'PbsScheme',
    metadata: { rowCount: rows.length } as any,
  });

  const text = lines.join('\n');
  const filename = `pbs-pay-by-month-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.txt`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(text);
}
