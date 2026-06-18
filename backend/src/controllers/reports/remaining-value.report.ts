import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../../utils/prisma';
import { writeAudit } from '../../utils/audit';

const TITLE    = 'LEISURE HOLIDAYS BHD';
const SUBTITLE = 'REMAINING VALUE REPORT';

const CO_LABELS: Record<string, string> = {
  LHC: 'LHC (03 & 15)',
  CP:  'CP (02)',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '';
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Row type ──────────────────────────────────────────────────────────────────

interface RemainingValueRow {
  membershipNo: string;
  fullName: string;
  agreementNo: string;
  agreementDate: Date;
  expiryDate: Date;
  expiryYear: number;
  purchasePrice: number;
  termYears: number;
  remainingYear: number;
  valuePerYear: number;
  remainingValue: number;
}

// ─── Data fetch ────────────────────────────────────────────────────────────────

async function fetchRows(coCode: string): Promise<RemainingValueRow[]> {
  const where = {
    acctClassify: 'NA' as const,
    coCode: coCode === 'LHC' ? { in: ['03', '15'] } : '02',
  };

  const agreements = await prisma.agreement.findMany({
    where,
    select: {
      agreementNo: true,
      agreementDate: true,
      endDate: true,
      termYears: true,
      purchasePrice: true,
      subFees: true,
      sinkFund: true,
      govtTax: true,
      member: { select: { fullName: true, membershipNo: true } },
    },
    orderBy: { agreementDate: 'asc' },
  });

  const currentYear = new Date().getFullYear();

  return agreements.map(a => {
    const expiry       = a.endDate ? new Date(a.endDate) : addYears(new Date(a.agreementDate), a.termYears);
    const expiryYear   = expiry.getFullYear();
    const gross        = Number(a.purchasePrice ?? 0);
    const sub          = Number(a.subFees ?? 0);
    const sink         = Number(a.sinkFund ?? 0);
    const tax          = Number(a.govtTax ?? 0);
    const price        = gross - sub - sink - tax;
    const vpyr         = a.termYears > 0 ? price / a.termYears : 0;
    const remainingYear = expiryYear - currentYear;
    const remainingValue = round2(Math.max(0, remainingYear * vpyr));

    return {
      membershipNo:   a.member?.membershipNo ?? '',
      fullName:       a.member?.fullName     ?? '',
      agreementNo:    a.agreementNo,
      agreementDate:  new Date(a.agreementDate),
      expiryDate:     expiry,
      expiryYear,
      purchasePrice:  price,
      termYears:      a.termYears,
      remainingYear,
      valuePerYear:   round2(vpyr),
      remainingValue,
    };
  });
}

// ─── Preview handler ───────────────────────────────────────────────────────────

const PREVIEW_LIMIT = 20;

export async function previewRemainingValueReport(req: Request, res: Response): Promise<void> {
  const coCode = String(req.query.coCode ?? 'LHC');
  if (coCode !== 'LHC' && coCode !== 'CP') {
    res.status(400).json({ error: 'coCode must be LHC or CP' });
    return;
  }

  const all = await fetchRows(coCode);

  const currentYear = new Date().getFullYear();
  const startYear   = currentYear + 1;
  const endYear     = all.length > 0 ? Math.max(...all.map(r => r.expiryYear)) : startYear;

  const rows = all.slice(0, PREVIEW_LIMIT).map((r, i) => ({
    no:            i + 1,
    membershipNo:  r.membershipNo,
    fullName:      r.fullName,
    agreementNo:   r.agreementNo,
    agreementDate: fmtDate(r.agreementDate),
    expiryDate:    fmtDate(r.expiryDate),
    purchasePrice: r.purchasePrice,
    remainingYear: r.remainingYear,
    valuePerYear:  r.valuePerYear,
    remainingValue: r.remainingValue,
  }));

  res.json({ data: rows, meta: { total: all.length, shown: rows.length, startYear, endYear } });
}

// ─── Generate handler ──────────────────────────────────────────────────────────

export async function generateRemainingValueReport(req: Request, res: Response): Promise<void> {
  const coCode = String(req.query.coCode ?? 'LHC');
  if (coCode !== 'LHC' && coCode !== 'CP') {
    res.status(400).json({ error: 'coCode must be LHC or CP' });
    return;
  }

  const rows = await fetchRows(coCode);

  await writeAudit({
    userId: req.user.id,
    action: `Generated Remaining Value report (${coCode}): ${rows.length} records`,
    actionType: 'CREATE',
    targetType: 'Agreement',
    metadata: { coCode, count: rows.length },
  });

  await renderExcel(res, rows, coCode);
}

// ─── Excel ─────────────────────────────────────────────────────────────────────

async function renderExcel(res: Response, rows: RemainingValueRow[], coCode: string): Promise<void> {
  const currentYear = new Date().getFullYear();
  const startYear   = currentYear + 1;
  const endYear     = rows.length > 0 ? Math.max(...rows.map(r => r.expiryYear)) : startYear;
  const yearCols    = endYear >= startYear
    ? Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i)
    : [];

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const nowStr  = new Date().toLocaleString('en-MY', { hour12: false });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="remaining-value-${coCode.toLowerCase()}-${dateStr}.xlsx"`);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LHB MMS';
  wb.created = new Date();
  const ws = wb.addWorksheet('Remaining Value');

  const FIXED_COLS = 10;
  const totalCols  = FIXED_COLS + yearCols.length;
  const lastCol    = colLetter(totalCols);

  // Column widths
  ws.columns = [
    { width: 5  }, // #
    { width: 18 }, // Membership No.
    { width: 36 }, // Name
    { width: 16 }, // Agreement No.
    { width: 16 }, // Agreement Date
    { width: 16 }, // Expiry Date
    { width: 20 }, // Net Purchase Price
    { width: 16 }, // Remaining Year
    { width: 18 }, // Value Per Year
    { width: 18 }, // Remaining Value
    ...yearCols.map(() => ({ width: 14 })),
  ];

  // Row 1: Company title
  const r1 = ws.addRow([TITLE]);
  ws.mergeCells(`A${r1.number}:${lastCol}${r1.number}`);
  r1.height = 22;
  r1.getCell(1).font      = { bold: true, size: 14, color: { argb: 'FF1B4F72' } };
  r1.getCell(1).alignment = { vertical: 'middle' };

  // Row 2: Report subtitle
  const r2 = ws.addRow([SUBTITLE]);
  ws.mergeCells(`A${r2.number}:${lastCol}${r2.number}`);
  r2.height = 18;
  r2.getCell(1).font      = { bold: true, size: 12, color: { argb: 'FF1B4F72' } };
  r2.getCell(1).alignment = { vertical: 'middle' };

  // Row 3: Filter info
  const r3 = ws.addRow([`Company: ${CO_LABELS[coCode] ?? coCode}   |   Generated: ${nowStr}   |   Total: ${rows.length} records`]);
  ws.mergeCells(`A${r3.number}:${lastCol}${r3.number}`);
  r3.height = 16;
  r3.getCell(1).font      = { size: 9, color: { argb: 'FF555555' } };
  r3.getCell(1).alignment = { vertical: 'middle' };

  // Row 4: blank
  ws.addRow([]);

  // Row 5: Column headers
  const headers = [
    '#', 'Membership No.', 'Name', 'Agreement No.',
    'Agreement Date', 'Expiry Date', 'Net Purchase Price',
    'Remaining Year', 'Value Per Year', 'Remaining Value',
    ...yearCols.map(y => String(y)),
  ];
  const hdrRow = ws.addRow(headers);
  hdrRow.height = 20;
  hdrRow.eachCell(cell => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    cell.border    = { bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } };
  });
  // Left-align text columns
  [1, 2, 3, 4, 5, 6].forEach(col => {
    hdrRow.getCell(col).alignment = { vertical: 'middle', horizontal: 'left' };
  });

  ws.views      = [{ state: 'frozen', ySplit: hdrRow.number }];
  ws.autoFilter = { from: { row: hdrRow.number, column: 1 }, to: { row: hdrRow.number, column: totalCols } };

  const numFmt = '#,##0.00';

  // Totals / counts accumulators
  let totalPurchasePrice  = 0;
  let totalRemainingValue = 0;
  const yearTotals  = new Array(yearCols.length).fill(0);
  const yearCounts  = new Array(yearCols.length).fill(0);

  // Data rows
  for (let i = 0; i < rows.length; i++) {
    const r    = rows[i];
    const even = i % 2 === 0;
    const bg: ExcelJS.Fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: even ? 'FFFFFFFF' : 'FFEBF5FB' },
    };

    // Year column values for this row
    const yearValues = yearCols.map(y => {
      const v = round2(Math.max(0, (r.expiryYear - y) * r.valuePerYear));
      return v;
    });

    const dataRow = ws.addRow([
      i + 1,
      r.membershipNo,
      r.fullName,
      r.agreementNo,
      fmtDate(r.agreementDate),
      fmtDate(r.expiryDate),
      r.purchasePrice,
      r.remainingYear,
      r.valuePerYear,
      r.remainingValue,
      ...yearValues,
    ]);

    dataRow.eachCell((cell, colNum) => {
      cell.fill      = bg;
      cell.alignment = { vertical: 'middle', horizontal: colNum <= 6 ? 'left' : 'right' };
    });

    // Apply number format to numeric columns
    [7, 9, 10].forEach(col => {
      dataRow.getCell(col).numFmt = numFmt;
    });
    for (let j = 0; j < yearCols.length; j++) {
      dataRow.getCell(FIXED_COLS + 1 + j).numFmt = numFmt;
    }

    // Accumulate totals and counts
    totalPurchasePrice  += r.purchasePrice;
    totalRemainingValue += r.remainingValue;
    yearValues.forEach((v, j) => {
      yearTotals[j] += v;
      if (v > 0) yearCounts[j]++;
    });
  }

  // Total row
  const totFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
  const totFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };

  const totalRowValues: (string | number)[] = [
    'TOTAL', '', '', '', '', '',
    round2(totalPurchasePrice),
    '',
    '',
    round2(totalRemainingValue),
    ...yearTotals.map(v => round2(v)),
  ];
  const totRow = ws.addRow(totalRowValues);
  totRow.height = 18;
  totRow.eachCell((cell, colNum) => {
    cell.fill      = totFill;
    cell.font      = totFont;
    cell.alignment = { vertical: 'middle', horizontal: colNum <= 6 ? 'left' : 'right' };
  });
  // Number formats on total row
  [7, 10].forEach(col => {
    totRow.getCell(col).numFmt = numFmt;
  });
  for (let j = 0; j < yearCols.length; j++) {
    totRow.getCell(FIXED_COLS + 1 + j).numFmt = numFmt;
  }

  // Count row (number of agreements with non-zero remaining value per year)
  const cntFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E86C1' } };
  const cntFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };

  const countRowValues: (string | number)[] = [
    'COUNT', '', '', '', '', '', '', '', '', '',
    ...yearCounts,
  ];
  const cntRow = ws.addRow(countRowValues);
  cntRow.height = 18;
  cntRow.eachCell((cell, colNum) => {
    cell.fill      = cntFill;
    cell.font      = cntFont;
    cell.alignment = { vertical: 'middle', horizontal: colNum <= 6 ? 'left' : 'right' };
  });

  await wb.xlsx.write(res);
}

function colLetter(n: number): string {
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}
