import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { prisma } from '../../utils/prisma';
import { writeAudit } from '../../utils/audit';

const TITLE    = 'LEISURE HOLIDAYS BHD';
const SUBTITLE = 'SUMMARY OF EXPIRING MEMBERS BY YEARS';

const CO_LABELS: Record<string, string> = {
  LHC: 'LHC (03 & 15)',
  CP:  'CP (02)',
};

// ─── Data types ────────────────────────────────────────────────────────────────

export interface ExpirySummaryRow {
  year:   number;
  naRa:   number;
  suLe3:  number;
  suGt3:  number;
  ptLe3:  number;
  ptGt3:  number;
  total:  number;
}

// ─── Data aggregation ──────────────────────────────────────────────────────────

async function buildRows(coCode: string): Promise<ExpirySummaryRow[]> {
  const agreements = await prisma.agreement.findMany({
    where: {
      acctClassify: { in: ['NA', 'SU', 'PT'] },
      coCode: coCode === 'LHC' ? { in: ['03', '15'] } : '02',
    },
    select: {
      acctClassify:     true,
      endDate:          true,
      agreementDate:    true,
      termYears:        true,
      statusChangeDate: true,
    },
  });

  const currentYear = new Date().getFullYear();
  const map = new Map<number, { naRa: number; suLe3: number; suGt3: number; ptLe3: number; ptGt3: number }>();

  for (const a of agreements) {
    const expiryYear = a.endDate
      ? new Date(a.endDate).getFullYear()
      : new Date(a.agreementDate).getFullYear() + a.termYears;

    if (!map.has(expiryYear)) {
      map.set(expiryYear, { naRa: 0, suLe3: 0, suGt3: 0, ptLe3: 0, ptGt3: 0 });
    }
    const b = map.get(expiryYear)!;

    if (a.acctClassify === 'NA') {
      b.naRa++;
    } else {
      const yrs = a.statusChangeDate
        ? currentYear - new Date(a.statusChangeDate).getFullYear()
        : 0;
      if (a.acctClassify === 'SU') {
        if (yrs <= 3) b.suLe3++; else b.suGt3++;
      }
      if (a.acctClassify === 'PT') {
        if (yrs <= 3) b.ptLe3++; else b.ptGt3++;
      }
    }
  }

  const years = Array.from(map.keys()).sort((a, b) => a - b);
  return years.map(year => {
    const b = map.get(year)!;
    return {
      year,
      naRa:  b.naRa,
      suLe3: b.suLe3,
      suGt3: b.suGt3,
      ptLe3: b.ptLe3,
      ptGt3: b.ptGt3,
      total: b.naRa + b.suLe3 + b.suGt3 + b.ptLe3 + b.ptGt3,
    };
  });
}

// ─── Endpoints ─────────────────────────────────────────────────────────────────

export async function previewExpirySummaryReport(req: Request, res: Response): Promise<void> {
  const coCode = String(req.query.coCode ?? 'LHC');
  if (coCode !== 'LHC' && coCode !== 'CP') {
    res.status(400).json({ error: 'coCode must be LHC or CP' });
    return;
  }
  const rows = await buildRows(coCode);
  const totalAgreements = rows.reduce((s, r) => s + r.total, 0);
  res.json({ data: rows, meta: { totalAgreements, coCode } });
}

export async function generateExpirySummaryReport(req: Request, res: Response): Promise<void> {
  const coCode = String(req.query.coCode ?? 'LHC');
  const format = String(req.query.format ?? 'excel');

  if (coCode !== 'LHC' && coCode !== 'CP') {
    res.status(400).json({ error: 'coCode must be LHC or CP' });
    return;
  }
  if (format !== 'pdf' && format !== 'excel') {
    res.status(400).json({ error: 'format must be pdf or excel' });
    return;
  }

  const rows = await buildRows(coCode);

  await writeAudit({
    userId: req.user.id,
    action: `Generated Summary of Expiring Members by Years (${coCode}, ${format}): ${rows.length} years`,
    actionType: 'CREATE',
    targetType: 'Agreement',
    metadata: { coCode, format, yearCount: rows.length },
  });

  if (format === 'pdf') {
    renderPdf(res, rows, coCode);
  } else {
    await renderExcel(res, rows, coCode);
  }
}

// ─── PDF ───────────────────────────────────────────────────────────────────────

const MARGIN  = 20;
const PAGE_W  = 595;
const COL_YR  = 72;
const COL_D   = 48;
const COL_TOT = 45;
const TOTAL_W = COL_YR + COL_D * 5 + COL_TOT; // 72 + 240 + 45 = 357 (~60% of A4 portrait)
const TABLE_X = MARGIN; // left-justified
const GRP_H   = 20;
const SUBH_H  = 16;
const ROW_H   = 16;
const FS      = 9;
const PAD     = 4;

const WIDTHS = [COL_YR, COL_D, COL_D, COL_D, COL_D, COL_D, COL_TOT];

const SUB_HDRS = ['Expiry Year', 'NA/RA', 'SU <=3 Yr', 'SU >3 Yr', 'PT <=3 Yr', 'PT >3 Yr', 'Total'];

function drawPdfHeaders(doc: PDFKit.PDFDocument, y: number): void {
  // Row 1: group header
  doc.rect(TABLE_X, y, TOTAL_W, GRP_H).fill('#1B4F72');
  doc.fillColor('white').font('Helvetica-Bold').fontSize(FS);
  // "Expiry Year" spanning first column
  doc.text('Expiry Year', TABLE_X + PAD, y + (GRP_H - FS) / 2, {
    width: COL_YR - PAD * 2, lineBreak: false, align: 'center',
  });
  // "Status" spanning cols 2–6
  doc.text('Status', TABLE_X + COL_YR + PAD, y + (GRP_H - FS) / 2, {
    width: COL_D * 5 - PAD * 2, lineBreak: false, align: 'center',
  });
  // "Total" spanning last column
  doc.text('Total', TABLE_X + COL_YR + COL_D * 5 + PAD, y + (GRP_H - FS) / 2, {
    width: COL_TOT - PAD * 2, lineBreak: false, align: 'center',
  });

  // Row 2: sub-headers
  const sy = y + GRP_H;
  doc.rect(TABLE_X, sy, TOTAL_W, SUBH_H).fill('#2E86C1');
  doc.fillColor('white').font('Helvetica-Bold').fontSize(FS - 1);

  let x2 = TABLE_X;
  for (let i = 0; i < WIDTHS.length; i++) {
    const w = WIDTHS[i];
    doc.text(SUB_HDRS[i], x2 + PAD, sy + (SUBH_H - (FS - 1)) / 2, {
      width: w - PAD * 2, lineBreak: false, align: i === 0 ? 'left' : 'right',
    });
    x2 += w;
  }
}

function drawPdfDataRow(doc: PDFKit.PDFDocument, row: ExpirySummaryRow, rowIdx: number, y: number): void {
  const bg = rowIdx % 2 === 0 ? '#FFFFFF' : '#EBF5FB';
  doc.rect(TABLE_X, y, TOTAL_W, ROW_H).fill(bg);

  const vals = [
    String(row.year),
    fmt(row.naRa), fmt(row.suLe3), fmt(row.suGt3),
    fmt(row.ptLe3), fmt(row.ptGt3), fmt(row.total),
  ];

  doc.fillColor('#111111').font('Helvetica').fontSize(FS);
  let cx = TABLE_X;
  for (let i = 0; i < WIDTHS.length; i++) {
    const w = WIDTHS[i];
    doc.text(vals[i], cx + PAD, y + (ROW_H - FS) / 2, {
      width: w - PAD * 2, lineBreak: false, align: i === 0 ? 'left' : 'right',
    });
    cx += w;
  }
  doc.moveTo(TABLE_X, y + ROW_H).lineTo(TABLE_X + TOTAL_W, y + ROW_H)
     .strokeColor('#D5D8DC').lineWidth(0.2).stroke();
}

function drawPdfTotalRow(doc: PDFKit.PDFDocument, rows: ExpirySummaryRow[], y: number): void {
  doc.rect(TABLE_X, y, TOTAL_W, ROW_H).fill('#1B4F72');

  const vals = [
    'TOTAL',
    fmt(rows.reduce((s, r) => s + r.naRa,  0)),
    fmt(rows.reduce((s, r) => s + r.suLe3, 0)),
    fmt(rows.reduce((s, r) => s + r.suGt3, 0)),
    fmt(rows.reduce((s, r) => s + r.ptLe3, 0)),
    fmt(rows.reduce((s, r) => s + r.ptGt3, 0)),
    fmt(rows.reduce((s, r) => s + r.total, 0)),
  ];

  doc.fillColor('white').font('Helvetica-Bold').fontSize(FS);
  let cx = TABLE_X;
  for (let i = 0; i < WIDTHS.length; i++) {
    const w = WIDTHS[i];
    doc.text(vals[i], cx + PAD, y + (ROW_H - FS) / 2, {
      width: w - PAD * 2, lineBreak: false, align: i === 0 ? 'left' : 'right',
    });
    cx += w;
  }
}

function fmt(v: number): string { return v === 0 ? '-' : v.toLocaleString(); }

function renderPdf(res: Response, rows: ExpirySummaryRow[], coCode: string): void {
  const nowStr = new Date().toLocaleString('en-MY', { hour12: false });
  const coLabel = CO_LABELS[coCode] ?? coCode;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="expiry-summary-${coCode.toLowerCase()}-${dateSuffix()}.pdf"`);

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: 0, left: MARGIN, right: MARGIN },
    autoFirstPage: true,
    info: { Title: SUBTITLE, Author: 'LHB MMS' },
  });
  doc.pipe(res);

  const pageH       = doc.page.height;
  const pageW       = doc.page.width;
  let   pageNum     = 1;
  const bottomLimit = pageH - 24;

  const addFooter = () => {
    const fy = pageH - 14;
    const info = `Company: ${coLabel}   |   Generated: ${nowStr}`;
    doc.fontSize(6).fillColor('#888888').font('Helvetica');
    doc.text(info, MARGIN, fy, { width: pageW - MARGIN * 2 - 50, lineBreak: false, align: 'left' });
    doc.text(`Page ${pageNum}`, MARGIN, fy, { width: pageW - MARGIN * 2, lineBreak: false, align: 'right' });
  };

  // Title block
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#1B4F72');
  doc.text(TITLE, MARGIN, MARGIN, { width: PAGE_W - MARGIN * 2, lineBreak: false });
  doc.fontSize(9).font('Helvetica').fillColor('#333333');
  doc.text(SUBTITLE, MARGIN, MARGIN + 18, { width: PAGE_W - MARGIN * 2, lineBreak: false });
  doc.fontSize(8).fillColor('#555555');
  doc.text(`Company: ${coLabel}   |   Generated: ${nowStr}`, MARGIN, MARGIN + 30, { width: PAGE_W - MARGIN * 2, lineBreak: false });

  let y = MARGIN + 50;
  drawPdfHeaders(doc, y);
  y += GRP_H + SUBH_H;

  for (let i = 0; i < rows.length; i++) {
    if (y + ROW_H > bottomLimit) {
      addFooter();
      doc.addPage();
      pageNum++;
      y = MARGIN;
      drawPdfHeaders(doc, y);
      y += GRP_H + SUBH_H;
    }
    drawPdfDataRow(doc, rows[i], i, y);
    y += ROW_H;
  }

  if (rows.length > 0) {
    if (y + ROW_H > bottomLimit) {
      addFooter();
      doc.addPage();
      pageNum++;
      y = MARGIN;
      drawPdfHeaders(doc, y);
      y += GRP_H + SUBH_H;
    }
    drawPdfTotalRow(doc, rows, y);
  }

  addFooter();
  doc.end();
}

// ─── Excel ─────────────────────────────────────────────────────────────────────

async function renderExcel(res: Response, rows: ExpirySummaryRow[], coCode: string): Promise<void> {
  const nowStr  = new Date().toLocaleString('en-MY', { hour12: false });
  const coLabel = CO_LABELS[coCode] ?? coCode;
  const totalAgreements = rows.reduce((s, r) => s + r.total, 0);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="expiry-summary-${coCode.toLowerCase()}-${dateSuffix()}.xlsx"`);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LHB MMS';
  wb.created = new Date();
  const ws = wb.addWorksheet('Expiry Summary');

  ws.columns = [
    { width: 14 }, // Expiry Year
    { width: 12 }, // NA/RA
    { width: 14 }, // SU <=3 Yr
    { width: 14 }, // SU >3 Yr
    { width: 14 }, // PT <=3 Yr
    { width: 14 }, // PT >3 Yr
    { width: 14 }, // Total
  ];

  // Row 1: company title
  const r1 = ws.addRow([TITLE]);
  ws.mergeCells('A1:G1');
  r1.height = 22;
  r1.getCell(1).font      = { bold: true, size: 14, color: { argb: 'FF1B4F72' } };
  r1.getCell(1).alignment = { vertical: 'middle' };

  // Row 2: subtitle
  const r2 = ws.addRow([SUBTITLE]);
  ws.mergeCells('A2:G2');
  r2.height = 18;
  r2.getCell(1).font      = { bold: true, size: 11, color: { argb: 'FF1B4F72' } };
  r2.getCell(1).alignment = { vertical: 'middle' };

  // Row 3: filter info
  const r3 = ws.addRow([`Company: ${coLabel}   |   Generated: ${nowStr}   |   Total: ${totalAgreements.toLocaleString()} agreements`]);
  ws.mergeCells('A3:G3');
  r3.height = 16;
  r3.getCell(1).font      = { size: 9, color: { argb: 'FF555555' } };
  r3.getCell(1).alignment = { vertical: 'middle' };

  // Row 4: blank
  ws.addRow([]);

  // Row 5: group header ("Expiry Year" | "Status" x5 | "Total")
  const grpRow = ws.addRow(['Expiry Year', 'Status', '', '', '', '', 'Total']);
  ws.mergeCells('B5:F5'); // Status spans 5 columns
  grpRow.height = 20;
  const grpFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
  const grpFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  grpRow.eachCell(cell => {
    cell.font      = grpFont;
    cell.fill      = grpFill;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  grpRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  grpRow.getCell(7).alignment = { vertical: 'middle', horizontal: 'right' };

  // Row 6: sub-headers
  const subRow = ws.addRow(['Expiry Year', 'NA/RA', 'SU <=3 Yr', 'SU >3 Yr', 'PT <=3 Yr', 'PT >3 Yr', 'Total']);
  subRow.height = 18;
  const subFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E86C1' } };
  const subFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
  subRow.eachCell((cell, colNum) => {
    cell.font      = subFont;
    cell.fill      = subFill;
    cell.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'left' : 'right' };
  });

  // Freeze panes at row 7 (after both header rows)
  ws.views = [{ state: 'frozen', ySplit: 6 }];

  // Data rows
  for (let i = 0; i < rows.length; i++) {
    const r    = rows[i];
    const even = i % 2 === 0;
    const bg: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: even ? 'FFFFFFFF' : 'FFEBF5FB' } };

    const dataRow = ws.addRow([
      r.year,
      fmtXl(r.naRa), fmtXl(r.suLe3), fmtXl(r.suGt3),
      fmtXl(r.ptLe3), fmtXl(r.ptGt3), fmtXl(r.total),
    ]);
    dataRow.eachCell((cell, colNum) => {
      cell.fill      = bg;
      cell.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'left' : 'right' };
    });
  }

  // Grand Total row
  if (rows.length > 0) {
    const totFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
    const totFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    const totRow = ws.addRow([
      'Grand Total',
      fmtXl(rows.reduce((s, r) => s + r.naRa,  0)),
      fmtXl(rows.reduce((s, r) => s + r.suLe3, 0)),
      fmtXl(rows.reduce((s, r) => s + r.suGt3, 0)),
      fmtXl(rows.reduce((s, r) => s + r.ptLe3, 0)),
      fmtXl(rows.reduce((s, r) => s + r.ptGt3, 0)),
      fmtXl(rows.reduce((s, r) => s + r.total, 0)),
    ]);
    totRow.height = 18;
    totRow.eachCell((cell, colNum) => {
      cell.fill      = totFill;
      cell.font      = totFont;
      cell.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'left' : 'right' };
    });
  }

  await wb.xlsx.write(res);
}

function fmtXl(v: number): number | string { return v === 0 ? '-' : v; }

function dateSuffix(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}
