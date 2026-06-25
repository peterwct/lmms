import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
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

export interface PbsPayYearRow {
  year: number;
  k19: StatusCounts & { total: number; totalRM: number };
  k21: StatusCounts & { total: number; totalRM: number };
  combined: StatusCounts & { total: number; totalRM: number };
}

async function buildRows(): Promise<PbsPayRow[]> {
  const rows: Array<{ year: number; month: number; scheme_type: string; status: string; cnt: bigint }> = await prisma.$queryRaw`
    SELECT
      EXTRACT(YEAR  FROM p."paybackDate")::int AS year,
      EXTRACT(MONTH FROM p."paybackDate")::int AS month,
      p."schemeType" AS scheme_type,
      a."acctClassify" AS status,
      COUNT(*)::bigint AS cnt
    FROM "PbsScheme" p
    JOIN "Agreement" a
      ON a."agreementNo" = p."agreementNo"
      AND a."coCode" = p."coCode"
      AND a."transferFlag" IS DISTINCT FROM 'TT'
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

async function buildYearlyRows(): Promise<PbsPayYearRow[]> {
  const rows: Array<{ year: number; scheme_type: string; status: string; cnt: bigint }> = await prisma.$queryRaw`
    SELECT
      EXTRACT(YEAR FROM p."paybackDate")::int AS year,
      p."schemeType" AS scheme_type,
      a."acctClassify" AS status,
      COUNT(*)::bigint AS cnt
    FROM "PbsScheme" p
    JOIN "Agreement" a
      ON a."agreementNo" = p."agreementNo"
      AND a."coCode" = p."coCode"
      AND a."transferFlag" IS DISTINCT FROM 'TT'
    WHERE p."paybackDate" IS NOT NULL
      AND p."schemeType" IN ('19K', '21K')
      AND p."pbsIndc" = true
      AND p."claimIndc" = false
    GROUP BY year, scheme_type, status
    ORDER BY year, scheme_type, status
  `;

  const map = new Map<number, { k19: StatusCounts; k21: StatusCounts }>();

  for (const r of rows) {
    if (!map.has(r.year)) {
      map.set(r.year, {
        k19: { na: 0, su: 0, pt: 0, tm: 0 },
        k21: { na: 0, su: 0, pt: 0, tm: 0 },
      });
    }
    const entry = map.get(r.year)!;
    const bucket = r.scheme_type === '19K' ? entry.k19 : entry.k21;
    const count = Number(r.cnt);

    if (r.status === 'NA') bucket.na += count;
    else if (r.status === 'SU') bucket.su += count;
    else if (r.status === 'PT') bucket.pt += count;
    else if (r.status === 'TM') bucket.tm += count;
  }

  const years = Array.from(map.keys()).sort();
  return years.map(year => {
    const e = map.get(year)!;
    const k19Total = e.k19.na + e.k19.su + e.k19.pt + e.k19.tm;
    const k21Total = e.k21.na + e.k21.su + e.k21.pt + e.k21.tm;
    const k19RM = k19Total * 19000;
    const k21RM = k21Total * 21000;
    return {
      year,
      k19: { ...e.k19, total: k19Total, totalRM: k19RM },
      k21: { ...e.k21, total: k21Total, totalRM: k21RM },
      combined: {
        na: e.k19.na + e.k21.na,
        su: e.k19.su + e.k21.su,
        pt: e.k19.pt + e.k21.pt,
        tm: e.k19.tm + e.k21.tm,
        total: k19Total + k21Total,
        totalRM: k19RM + k21RM,
      },
    };
  });
}

function sumTotals(rows: PbsPayRow[]) {
  const t = {
    k19: { na: 0, su: 0, pt: 0, tm: 0, total: 0 },
    k21: { na: 0, su: 0, pt: 0, tm: 0, total: 0 },
  };
  for (const r of rows) {
    t.k19.na += r.k19.na; t.k19.su += r.k19.su;
    t.k19.pt += r.k19.pt; t.k19.tm += r.k19.tm;
    t.k19.total += r.k19.total;
    t.k21.na += r.k21.na; t.k21.su += r.k21.su;
    t.k21.pt += r.k21.pt; t.k21.tm += r.k21.tm;
    t.k21.total += r.k21.total;
  }
  return t;
}

// ── Preview ───────────────────────────────────────────────────────────────────

export async function previewPbsPayByMonth(req: Request, res: Response): Promise<void> {
  const [monthlyRows, yearlyRows] = await Promise.all([
    buildRows(),
    buildYearlyRows(),
  ]);

  const totals = sumTotals(monthlyRows);

  res.json({ data: monthlyRows, yearly: yearlyRows, meta: { totalRows: monthlyRows.length, totals } });
}

// ── Generate Excel ───────────────────────────────────────────────────────────

function fmtRM(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const HDR_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
const HDR_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
const SEC_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E86C1' } };
const SEC_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
const NUM_FMT = '#,##0.00';

function applyHdr(cell: ExcelJS.Cell) {
  cell.font = HDR_FONT;
  cell.fill = HDR_FILL;
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
  cell.border = { bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } };
}

function applySec(cell: ExcelJS.Cell) {
  cell.font = SEC_FONT;
  cell.fill = SEC_FILL;
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
}

function buildMonthlySheet(wb: ExcelJS.Workbook, rows: PbsPayRow[], dateStr: string, monthYr: string) {
  const ws = wb.addWorksheet('Pay By Month');

  // Title
  const r1 = ws.addRow([`PBS Payback Report II For ${monthYr}`]);
  ws.mergeCells(`A${r1.number}:U${r1.number}`);
  r1.height = 22;
  r1.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF1B4F72' } };
  r1.getCell(1).alignment = { vertical: 'middle' };

  const r2 = ws.addRow([`Date: ${dateStr}   |   Total: ${rows.length} periods`]);
  ws.mergeCells(`A${r2.number}:U${r2.number}`);
  r2.height = 16;
  r2.getCell(1).font = { size: 9, color: { argb: 'FF555555' } };
  r2.getCell(1).alignment = { vertical: 'middle' };

  ws.addRow([]);

  // Section header row
  const secRow = ws.addRow([
    '', '',
    'RM19K Pay Back Scheme', '', '', '', '', '', '', '', '', '',
    'RM21K Payback Scheme', '', '', '', '', '', '', '', '',
  ]);
  secRow.height = 18;
  // 19K section: C-L (cols 3-12)
  ws.mergeCells(`C${secRow.number}:L${secRow.number}`);
  applySec(secRow.getCell(3));
  // 21K section: M-V... wait, let me count columns properly

  // Columns: A=Year, B=Month,
  //   19K: C=NA/RA, D=Total(RM), E=SU, F=Total(RM), G=PT, H=Total(RM), I=TM, J=Total(RM), K=Ttl 19K, L=Total(RM)
  //   21K: M=NA/RA, N=Total(RM), O=SU, P=Total(RM), Q=PT, R=Total(RM), S=TM, T=Total(RM), U=Ttl 21K, V=Total(RM)
  // That's 22 columns (A-V)

  ws.mergeCells(`M${secRow.number}:V${secRow.number}`);
  applySec(secRow.getCell(13));

  // Column header row
  const headers = [
    'Year', 'Month',
    'NA/RA', 'Total (RM)', 'SU', 'Total (RM)', 'PT', 'Total (RM)', 'TM', 'Total (RM)', 'Ttl 19K', 'Total (RM)',
    'NA/RA', 'Total (RM)', 'SU', 'Total (RM)', 'PT', 'Total (RM)', 'TM', 'Total (RM)', 'Ttl 21K', 'Total (RM)',
  ];
  const hdrRow = ws.addRow(headers);
  hdrRow.height = 20;
  hdrRow.eachCell(cell => applyHdr(cell));

  ws.views = [{ state: 'frozen', ySplit: hdrRow.number }];

  // Column widths
  const widths = [6, 8, 8, 14, 6, 14, 6, 14, 6, 14, 9, 14, 8, 14, 6, 14, 6, 14, 6, 14, 9, 14];
  ws.columns = widths.map(w => ({ width: w }));

  // Data rows
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const even = i % 2 === 0;
    const bg: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: even ? 'FFFFFFFF' : 'FFEBF5FB' } };

    const dataRow = ws.addRow([
      r.year, String(r.month).padStart(2, '0'),
      r.k19.na, r.k19.na * 19000, r.k19.su, r.k19.su * 19000, r.k19.pt, r.k19.pt * 19000, r.k19.tm, r.k19.tm * 19000, r.k19.total, r.k19.totalRM,
      r.k21.na, r.k21.na * 21000, r.k21.su, r.k21.su * 21000, r.k21.pt, r.k21.pt * 21000, r.k21.tm, r.k21.tm * 21000, r.k21.total, r.k21.totalRM,
    ]);
    const mSectionBorderCols = [2, 12, 22];
    dataRow.eachCell((cell, colNum) => {
      cell.fill = bg;
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
      if ([4, 6, 8, 10, 12, 14, 16, 18, 20, 22].includes(colNum)) cell.numFmt = NUM_FMT;
      if (mSectionBorderCols.includes(colNum)) cell.border = { right: { style: 'thin', color: { argb: 'FF999999' } } };
    });
  }

  // Totals
  ws.addRow([]);
  const t19 = { na: 0, su: 0, pt: 0, tm: 0, total: 0 };
  const t21 = { na: 0, su: 0, pt: 0, tm: 0, total: 0 };
  for (const r of rows) {
    t19.na += r.k19.na; t19.su += r.k19.su; t19.pt += r.k19.pt; t19.tm += r.k19.tm; t19.total += r.k19.total;
    t21.na += r.k21.na; t21.su += r.k21.su; t21.pt += r.k21.pt; t21.tm += r.k21.tm; t21.total += r.k21.total;
  }
  const mSectionBorderCols = [2, 12, 22];
  const totalRow = ws.addRow([
    'Total:', '',
    t19.na, t19.na * 19000, t19.su, t19.su * 19000, t19.pt, t19.pt * 19000, t19.tm, t19.tm * 19000, t19.total, t19.total * 19000,
    t21.na, t21.na * 21000, t21.su, t21.su * 21000, t21.pt, t21.pt * 21000, t21.tm, t21.tm * 21000, t21.total, t21.total * 21000,
  ]);
  totalRow.eachCell((cell, colNum) => {
    cell.font = { bold: true, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'right' };
    if ([4, 6, 8, 10, 12, 14, 16, 18, 20, 22].includes(colNum)) cell.numFmt = NUM_FMT;
    if (mSectionBorderCols.includes(colNum)) cell.border = { right: { style: 'thin', color: { argb: 'FF999999' } } };
  });
  totalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
}

function buildYearlySheet(wb: ExcelJS.Workbook, rows: PbsPayYearRow[], dateStr: string, monthYr: string) {
  const ws = wb.addWorksheet('Pay By Year');

  // Title
  const r1 = ws.addRow([`PBS Payback Summary Report For ${monthYr}`]);
  ws.mergeCells(`A${r1.number}:AB${r1.number}`);
  r1.height = 22;
  r1.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF1B4F72' } };
  r1.getCell(1).alignment = { vertical: 'middle' };

  const r2 = ws.addRow([`Date: ${dateStr}   |   Total: ${rows.length} years`]);
  ws.mergeCells(`A${r2.number}:AB${r2.number}`);
  r2.height = 16;
  r2.getCell(1).font = { size: 9, color: { argb: 'FF555555' } };
  r2.getCell(1).alignment = { vertical: 'middle' };

  ws.addRow([]);

  // Columns: A=Year,
  //   19K: B-K (10 cols: NA, RM, SU, RM, PT, RM, TM, RM, Ttl, RM)
  //   21K: L-U (10 cols)
  //   Combined: V-AE (10 cols)
  // Total = 1 + 10 + 10 + 10 = 31 cols (A to AE)

  // Section header row
  const secRow = ws.addRow([
    '',
    'RM19K Pay Back Scheme', '', '', '', '', '', '', '', '', '',
    'RM21K Payback Scheme', '', '', '', '', '', '', '', '', '',
    'RM19K + RM21K', '', '', '', '', '', '', '', '', '',
  ]);
  secRow.height = 18;
  ws.mergeCells(`B${secRow.number}:K${secRow.number}`);
  applySec(secRow.getCell(2));
  ws.mergeCells(`L${secRow.number}:U${secRow.number}`);
  applySec(secRow.getCell(12));
  ws.mergeCells(`V${secRow.number}:AE${secRow.number}`);
  applySec(secRow.getCell(22));

  // Column header row
  const statusHeaders = ['NA/RA', 'Total (RM)', 'SU', 'Total (RM)', 'PT', 'Total (RM)', 'TM', 'Total (RM)'];
  const headers = [
    'Year',
    ...statusHeaders, 'Ttl 19K', 'Total (RM)',
    ...statusHeaders, 'Ttl 21K', 'Total (RM)',
    ...statusHeaders, 'Row Ttl', 'Row Ttl Sum',
  ];
  const hdrRow = ws.addRow(headers);
  hdrRow.height = 20;
  hdrRow.eachCell(cell => applyHdr(cell));

  ws.views = [{ state: 'frozen', ySplit: hdrRow.number }];

  // Column widths: A=6, then 10 cols x3 sections
  const sectionWidths = [8, 14, 6, 14, 6, 14, 6, 14, 9, 14];
  ws.columns = [6, ...sectionWidths, ...sectionWidths, ...sectionWidths].map(w => ({ width: w }));

  // Amount column indices (1-based): every even col in each 10-col section
  const amtCols = [3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31];

  // Data rows
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const even = i % 2 === 0;
    const bg: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: even ? 'FFFFFFFF' : 'FFEBF5FB' } };

    const dataRow = ws.addRow([
      r.year,
      r.k19.na, r.k19.na * 19000, r.k19.su, r.k19.su * 19000, r.k19.pt, r.k19.pt * 19000, r.k19.tm, r.k19.tm * 19000, r.k19.total, r.k19.totalRM,
      r.k21.na, r.k21.na * 21000, r.k21.su, r.k21.su * 21000, r.k21.pt, r.k21.pt * 21000, r.k21.tm, r.k21.tm * 21000, r.k21.total, r.k21.totalRM,
      r.combined.na, r.combined.na * 19000 + (r.k21.na * 21000), r.combined.su, r.k19.su * 19000 + r.k21.su * 21000, r.combined.pt, r.k19.pt * 19000 + r.k21.pt * 21000, r.combined.tm, r.k19.tm * 19000 + r.k21.tm * 21000, r.combined.total, r.combined.totalRM,
    ]);
    // Section border: right edge of Year(1), 19K(11), 21K(21), Combined(31)
    const sectionBorderCols = [1, 11, 21, 31];
    dataRow.eachCell((cell, colNum) => {
      cell.fill = bg;
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
      if (amtCols.includes(colNum)) cell.numFmt = NUM_FMT;
      if (sectionBorderCols.includes(colNum)) cell.border = { right: { style: 'thin', color: { argb: 'FF999999' } } };
    });
  }

  // Totals
  ws.addRow([]);
  const t = { k19: { na: 0, su: 0, pt: 0, tm: 0, total: 0 }, k21: { na: 0, su: 0, pt: 0, tm: 0, total: 0 }, combined: { na: 0, su: 0, pt: 0, tm: 0, total: 0 } };
  for (const r of rows) {
    t.k19.na += r.k19.na; t.k19.su += r.k19.su; t.k19.pt += r.k19.pt; t.k19.tm += r.k19.tm; t.k19.total += r.k19.total;
    t.k21.na += r.k21.na; t.k21.su += r.k21.su; t.k21.pt += r.k21.pt; t.k21.tm += r.k21.tm; t.k21.total += r.k21.total;
    t.combined.na += r.combined.na; t.combined.su += r.combined.su; t.combined.pt += r.combined.pt; t.combined.tm += r.combined.tm; t.combined.total += r.combined.total;
  }
  const sectionBorderCols = [1, 11, 21, 31];
  const totalRow = ws.addRow([
    'Total:',
    t.k19.na, t.k19.na * 19000, t.k19.su, t.k19.su * 19000, t.k19.pt, t.k19.pt * 19000, t.k19.tm, t.k19.tm * 19000, t.k19.total, t.k19.total * 19000,
    t.k21.na, t.k21.na * 21000, t.k21.su, t.k21.su * 21000, t.k21.pt, t.k21.pt * 21000, t.k21.tm, t.k21.tm * 21000, t.k21.total, t.k21.total * 21000,
    t.combined.na, t.k19.na * 19000 + t.k21.na * 21000, t.combined.su, t.k19.su * 19000 + t.k21.su * 21000, t.combined.pt, t.k19.pt * 19000 + t.k21.pt * 21000, t.combined.tm, t.k19.tm * 19000 + t.k21.tm * 21000, t.combined.total, t.k19.total * 19000 + t.k21.total * 21000,
  ]);
  totalRow.eachCell((cell, colNum) => {
    cell.font = { bold: true, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'right' };
    if (amtCols.includes(colNum)) cell.numFmt = NUM_FMT;
    if (sectionBorderCols.includes(colNum)) cell.border = { right: { style: 'thin', color: { argb: 'FF999999' } } };
  });
  totalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
}

export async function generatePbsPayByMonth(req: Request, res: Response): Promise<void> {
  const [monthlyRows, yearlyRows] = await Promise.all([
    buildRows(),
    buildYearlyRows(),
  ]);

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
  const monthYr = `${MONTH_NAMES[now.getMonth() + 1]} ${now.getFullYear()}`;

  await writeAudit({
    userId: req.user!.id,
    action: `Generated PBS Pay By Month/Year report (Excel): ${monthlyRows.length} periods, ${yearlyRows.length} years`,
    actionType: 'CREATE',
    targetType: 'PbsScheme',
    metadata: { monthlyCount: monthlyRows.length, yearlyCount: yearlyRows.length } as any,
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="pbs-pay-by-month-year-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx"`);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LHB MMS';
  wb.created = now;

  buildMonthlySheet(wb, monthlyRows, dateStr, monthYr);
  buildYearlySheet(wb, yearlyRows, dateStr, monthYr);

  await wb.xlsx.write(res);
}
