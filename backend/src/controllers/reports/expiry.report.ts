import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { prisma } from '../../utils/prisma';
import { writeAudit } from '../../utils/audit';

const TITLE    = 'LEISURE HOLIDAYS BHD';
const SUBTITLE = 'SENIOR MANAGEMENT REPORT - ANALYSIS OF AGREEMENT EXPIRY';

// ─── Data types ────────────────────────────────────────────────────────────────

export interface ExpiryRow {
  year: number;
  lhcNa: number;
  lhcNonNa: number;
  lhcTotal: number;
  cpNa: number;
  cpNonNa: number;
  cpTotal: number;
  combinedNa: number;
  combinedNonNa: number;
  combinedTotal: number;
  cumNa: number;
  cumNonNa: number;
  cumTotal: number;
}

// ─── Data aggregation ──────────────────────────────────────────────────────────

async function buildRows(): Promise<ExpiryRow[]> {
  const agreements = await prisma.agreement.findMany({
    where: { acctClassify: { in: ['NA', 'SU', 'PT'] } },
    select: {
      coCode: true,
      acctClassify: true,
      endDate: true,
      agreementDate: true,
      termYears: true,
    },
  });

  const map = new Map<number, { lhcNa: number; lhcNonNa: number; cpNa: number; cpNonNa: number }>();

  for (const a of agreements) {
    const year = a.endDate
      ? new Date(a.endDate).getFullYear()
      : new Date(a.agreementDate).getFullYear() + a.termYears;

    if (!map.has(year)) map.set(year, { lhcNa: 0, lhcNonNa: 0, cpNa: 0, cpNonNa: 0 });
    const bucket = map.get(year)!;

    const isLHC = a.coCode === '03' || a.coCode === '15';
    const isCP  = a.coCode === '02';
    const isNA  = a.acctClassify === 'NA';

    if (isLHC) { if (isNA) bucket.lhcNa++; else bucket.lhcNonNa++; }
    if (isCP)  { if (isNA) bucket.cpNa++;  else bucket.cpNonNa++;  }
  }

  const years = Array.from(map.keys()).sort((a, b) => a - b);

  let cumNa = 0, cumNonNa = 0;

  return years.map(year => {
    const b            = map.get(year)!;
    const lhcTotal     = b.lhcNa    + b.lhcNonNa;
    const cpTotal      = b.cpNa     + b.cpNonNa;
    const combinedNa   = b.lhcNa   + b.cpNa;
    const combinedNonNa = b.lhcNonNa + b.cpNonNa;
    const combinedTotal = combinedNa + combinedNonNa;
    cumNa    += combinedNa;
    cumNonNa += combinedNonNa;
    return {
      year,
      lhcNa: b.lhcNa, lhcNonNa: b.lhcNonNa, lhcTotal,
      cpNa: b.cpNa,   cpNonNa: b.cpNonNa,   cpTotal,
      combinedNa, combinedNonNa, combinedTotal,
      cumNa, cumNonNa, cumTotal: cumNa + cumNonNa,
    };
  });
}

function fmt(v: number): string { return v === 0 ? '-' : v.toLocaleString(); }

// ─── Endpoints ─────────────────────────────────────────────────────────────────

export async function previewExpiryReport(req: Request, res: Response): Promise<void> {
  const rows = await buildRows();
  res.json({ data: rows, meta: { totalAgreements: rows.reduce((s, r) => s + r.combinedTotal, 0) } });
}

export async function generateExpiryReport(req: Request, res: Response): Promise<void> {
  const format = String(req.query.format ?? 'excel');
  const rows   = await buildRows();

  await writeAudit({
    userId: req.user.id,
    action: 'Generated Agreement Expiry report',
    actionType: 'CREATE',
    targetType: 'Agreement',
    metadata: { format, yearCount: rows.length },
  });

  if (format === 'excel') {
    await renderExcel(res, rows);
  } else {
    renderPdf(res, rows);
  }
}

// ─── PDF ───────────────────────────────────────────────────────────────────────

const MARGIN  = 20;
const COL_YR  = 66;   // Expiry Year column width
const COL_D   = 57;   // each of the 12 data columns
const TOTAL_W = COL_YR + COL_D * 12; // 66 + 684 = 750
const GRP_H   = 16;   // group header row height
const SUBH_H  = 13;   // sub-header row height
const ROW_H   = 13;   // data row height
const FS      = 7;
const PAD     = 3;

const GROUPS = [
  { label: 'LHC',                  cols: 3 },
  { label: 'CP',                   cols: 3 },
  { label: 'LHC & CP',            cols: 3 },
  { label: 'LHC & CP Cumulative', cols: 3 },
];

const WIDTHS = [COL_YR, ...Array<number>(12).fill(COL_D)];

const SUB_HDRS = [
  'Expiry Year',
  'NA', 'Non-NA', 'Total',
  'NA', 'Non-NA', 'Total',
  'NA', 'Non-NA', 'Total',
  'NA', 'Non-NA', 'Total',
];

// X positions of the group boundary lines (left edge + 4 inter-group + right edge)
const GROUP_X = [
  MARGIN,
  MARGIN + COL_YR,
  MARGIN + COL_YR + COL_D * 3,
  MARGIN + COL_YR + COL_D * 6,
  MARGIN + COL_YR + COL_D * 9,
  MARGIN + TOTAL_W,
];

function drawGroupBorders(doc: PDFKit.PDFDocument, y: number, h: number, color = '#1B4F72'): void {
  doc.strokeColor(color).lineWidth(0.8);
  for (const x of GROUP_X) {
    doc.moveTo(x, y).lineTo(x, y + h).stroke();
  }
}

function drawHeaders(doc: PDFKit.PDFDocument, y: number): void {
  // Row 1: group labels
  doc.rect(MARGIN, y, TOTAL_W, GRP_H).fill('#1B4F72');
  doc.fillColor('white').font('Helvetica-Bold').fontSize(FS);

  // "Expiry Year" spanning first column
  doc.text('Expiry Year', MARGIN + PAD, y + (GRP_H - FS) / 2, {
    width: COL_YR - PAD * 2, lineBreak: false, align: 'center',
  });

  let cx = MARGIN + COL_YR;
  for (const g of GROUPS) {
    const gw = COL_D * g.cols;
    doc.fillColor('white').font('Helvetica-Bold').fontSize(FS);
    doc.text(g.label, cx + PAD, y + (GRP_H - FS) / 2, {
      width: gw - PAD * 2, lineBreak: false, align: 'center',
    });
    cx += gw;
  }

  // Row 2: sub-headers
  const sy = y + GRP_H;
  doc.rect(MARGIN, sy, TOTAL_W, SUBH_H).fill('#2E86C1');
  doc.fillColor('white').font('Helvetica-Bold').fontSize(FS - 1);

  let x2 = MARGIN;
  for (let i = 0; i < 13; i++) {
    const w = WIDTHS[i];
    doc.text(SUB_HDRS[i], x2 + PAD, sy + (SUBH_H - (FS - 1)) / 2, {
      width: w - PAD * 2, lineBreak: false, align: i === 0 ? 'left' : 'right',
    });
    x2 += w;
  }

  // Group borders on top of fills
  drawGroupBorders(doc, y, GRP_H + SUBH_H, 'white');
}

function drawDataRow(doc: PDFKit.PDFDocument, row: ExpiryRow, rowIdx: number, y: number): void {
  const bg = rowIdx % 2 === 0 ? '#FFFFFF' : '#EBF5FB';
  doc.rect(MARGIN, y, TOTAL_W, ROW_H).fill(bg);

  // Cumulative columns (indices 10-12) get a lighter blue tint
  if (rowIdx % 2 === 0) {
    doc.rect(MARGIN + COL_YR + COL_D * 9, y, COL_D * 3, ROW_H).fill('#D6EAF8');
  } else {
    doc.rect(MARGIN + COL_YR + COL_D * 9, y, COL_D * 3, ROW_H).fill('#AED6F1');
  }

  const vals = [
    String(row.year),
    fmt(row.lhcNa), fmt(row.lhcNonNa), fmt(row.lhcTotal),
    fmt(row.cpNa),  fmt(row.cpNonNa),  fmt(row.cpTotal),
    fmt(row.combinedNa), fmt(row.combinedNonNa), fmt(row.combinedTotal),
    fmt(row.cumNa),      fmt(row.cumNonNa),      fmt(row.cumTotal),
  ];

  doc.fillColor('#111111').font('Helvetica').fontSize(FS);
  let cx = MARGIN;
  for (let i = 0; i < 13; i++) {
    const w = WIDTHS[i];
    doc.text(vals[i], cx + PAD, y + (ROW_H - FS) / 2, {
      width: w - PAD * 2, lineBreak: false, align: i === 0 ? 'left' : 'right',
    });
    cx += w;
  }

  doc.moveTo(MARGIN, y + ROW_H).lineTo(MARGIN + TOTAL_W, y + ROW_H)
     .strokeColor('#D5D8DC').lineWidth(0.2).stroke();
  drawGroupBorders(doc, y, ROW_H);
}

function drawTotalRow(doc: PDFKit.PDFDocument, rows: ExpiryRow[], y: number): void {
  const last = rows[rows.length - 1];
  const lhcNa    = rows.reduce((s, r) => s + r.lhcNa,    0);
  const lhcNonNa = rows.reduce((s, r) => s + r.lhcNonNa, 0);
  const lhcTotal = rows.reduce((s, r) => s + r.lhcTotal,  0);
  const cpNa     = rows.reduce((s, r) => s + r.cpNa,     0);
  const cpNonNa  = rows.reduce((s, r) => s + r.cpNonNa,  0);
  const cpTotal  = rows.reduce((s, r) => s + r.cpTotal,   0);
  const cmbNa    = rows.reduce((s, r) => s + r.combinedNa,    0);
  const cmbNonNa = rows.reduce((s, r) => s + r.combinedNonNa, 0);
  const cmbTotal = rows.reduce((s, r) => s + r.combinedTotal, 0);

  // Dark header-style background for full row
  doc.rect(MARGIN, y, TOTAL_W, ROW_H).fill('#1B4F72');
  // Slightly different tint for cumulative columns
  doc.rect(MARGIN + COL_YR + COL_D * 9, y, COL_D * 3, ROW_H).fill('#154360');

  const vals = [
    'TOTAL',
    fmt(lhcNa), fmt(lhcNonNa), fmt(lhcTotal),
    fmt(cpNa),  fmt(cpNonNa),  fmt(cpTotal),
    fmt(cmbNa), fmt(cmbNonNa), fmt(cmbTotal),
    fmt(last.cumNa), fmt(last.cumNonNa), fmt(last.cumTotal),
  ];

  doc.fillColor('white').font('Helvetica-Bold').fontSize(FS);
  let cx = MARGIN;
  for (let i = 0; i < 13; i++) {
    const w = WIDTHS[i];
    doc.text(vals[i], cx + PAD, y + (ROW_H - FS) / 2, {
      width: w - PAD * 2, lineBreak: false, align: i === 0 ? 'left' : 'right',
    });
    cx += w;
  }
  drawGroupBorders(doc, y, ROW_H, 'white');
}

function renderPdf(res: Response, rows: ExpiryRow[]): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="agreement-expiry-report-${dateSuffix()}.pdf"`);

  const doc = new PDFDocument({
    size: 'A4', layout: 'landscape',
    margins: { top: MARGIN, bottom: 0, left: MARGIN, right: MARGIN },
    autoFirstPage: true,
    info: { Title: TITLE, Author: 'LHB MMS' },
  });
  doc.pipe(res);

  const pageH      = doc.page.height;
  const pageW      = doc.page.width;
  let   pageNum    = 1;
  const bottomLimit = pageH - 24;

  const addFooter = () => {
    const fy = pageH - 14;
    doc.fontSize(6).fillColor('#888888').font('Helvetica');
    doc.text(SUBTITLE, MARGIN, fy, { width: pageW - MARGIN * 2 - 50, lineBreak: false, align: 'left' });
    doc.text(`Page ${pageNum}`, MARGIN, fy, { width: pageW - MARGIN * 2, lineBreak: false, align: 'right' });
  };

  // Title block
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#1B4F72');
  doc.text(TITLE, MARGIN, MARGIN, { width: TOTAL_W, lineBreak: false });
  doc.fontSize(8).font('Helvetica').fillColor('#555555');
  doc.text(SUBTITLE, MARGIN, MARGIN + 18, { width: TOTAL_W, lineBreak: false });

  let y = MARGIN + 38;
  drawHeaders(doc, y);
  y += GRP_H + SUBH_H;

  for (let i = 0; i < rows.length; i++) {
    if (y + ROW_H > bottomLimit) {
      addFooter();
      doc.addPage();
      pageNum++;
      y = MARGIN;
      drawHeaders(doc, y);
      y += GRP_H + SUBH_H;
    }
    drawDataRow(doc, rows[i], i, y);
    y += ROW_H;
  }

  // Total row
  if (rows.length > 0) {
    if (y + ROW_H > bottomLimit) {
      addFooter();
      doc.addPage();
      pageNum++;
      y = MARGIN;
      drawHeaders(doc, y);
      y += GRP_H + SUBH_H;
    }
    drawTotalRow(doc, rows, y);
  }

  addFooter();
  doc.end();
}

// ─── Excel ─────────────────────────────────────────────────────────────────────

async function renderExcel(res: Response, rows: ExpiryRow[]): Promise<void> {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="agreement-expiry-report-${dateSuffix()}.xlsx"`);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LHB MMS';
  wb.created = new Date();
  const ws = wb.addWorksheet('Agreement Expiry');

  // Column widths: Expiry Year + 12 data columns
  ws.columns = [
    { width: 14 }, // Expiry Year
    { width: 10 }, { width: 12 }, { width: 10 }, // LHC
    { width: 10 }, { width: 12 }, { width: 10 }, // CP
    { width: 10 }, { width: 12 }, { width: 10 }, // LHC & CP
    { width: 12 }, { width: 14 }, { width: 12 }, // Cumulative
  ];

  // Row 1: Company title
  const r1 = ws.addRow([TITLE]);
  ws.mergeCells('A1:M1');
  r1.height = 22;
  r1.getCell(1).font      = { bold: true, size: 14, color: { argb: 'FF1B4F72' } };
  r1.getCell(1).alignment = { vertical: 'middle' };

  // Row 2: Report subtitle
  const r2 = ws.addRow([SUBTITLE]);
  ws.mergeCells('A2:M2');
  r2.height = 16;
  r2.getCell(1).font      = { size: 9, color: { argb: 'FF555555' } };
  r2.getCell(1).alignment = { vertical: 'middle' };

  // Row 3: blank
  ws.addRow([]);

  // Row 4: Group headers (merged spans)
  const grpRow = ws.addRow(['Expiry Year', 'LHC', '', '', 'CP', '', '', 'LHC & CP', '', '', 'LHC & CP Cumulative', '', '']);
  grpRow.height = 20;
  ws.mergeCells('B4:D4'); // LHC
  ws.mergeCells('E4:G4'); // CP
  ws.mergeCells('H4:J4'); // LHC & CP
  ws.mergeCells('K4:M4'); // Cumulative

  const grpFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
  const grpFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  const grpAlign: Partial<ExcelJS.Alignment> = { vertical: 'middle', horizontal: 'center' };
  grpRow.eachCell(cell => {
    cell.font      = grpFont;
    cell.fill      = grpFill;
    cell.alignment = grpAlign;
  });
  // First cell left-aligned
  grpRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  applyGroupBorders(grpRow, 'FFFFFFFF');

  // Row 5: Sub-headers
  const subRow = ws.addRow([
    'Expiry Year',
    'NA', 'Non-NA', 'Total',
    'NA', 'Non-NA', 'Total',
    'NA', 'Non-NA', 'Total',
    'NA', 'Non-NA', 'Total',
  ]);
  subRow.height = 18;
  const subFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E86C1' } };
  const subFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
  subRow.eachCell(cell => {
    cell.font      = subFont;
    cell.fill      = subFill;
    cell.alignment = { vertical: 'middle', horizontal: 'right' };
  });
  subRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  applyGroupBorders(subRow, 'FFFFFFFF');

  // Freeze panes at row 6
  ws.views = [{ state: 'frozen', ySplit: 5 }];

  // Data rows
  const cumFill = (even: boolean): ExcelJS.Fill => ({
    type: 'pattern', pattern: 'solid', fgColor: { argb: even ? 'FFD6EAF8' : 'FFAED6F1' },
  });

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const even = i % 2 === 0;
    const bg: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: even ? 'FFFFFFFF' : 'FFEBF5FB' } };

    const values = [
      r.year,
      fmtXl(r.lhcNa),    fmtXl(r.lhcNonNa),    fmtXl(r.lhcTotal),
      fmtXl(r.cpNa),     fmtXl(r.cpNonNa),     fmtXl(r.cpTotal),
      fmtXl(r.combinedNa), fmtXl(r.combinedNonNa), fmtXl(r.combinedTotal),
      fmtXl(r.cumNa),    fmtXl(r.cumNonNa),    fmtXl(r.cumTotal),
    ];

    const row = ws.addRow(values);
    row.eachCell((cell, colNum) => {
      cell.fill      = colNum >= 11 ? cumFill(even) : bg;
      cell.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'left' : 'right' };
    });
    applyGroupBorders(row, 'FF1B4F72');
  }

  // Total row
  if (rows.length > 0) {
    const last    = rows[rows.length - 1];
    const lhcNa   = rows.reduce((s, r) => s + r.lhcNa,    0);
    const lhcNonNa= rows.reduce((s, r) => s + r.lhcNonNa, 0);
    const lhcTot  = rows.reduce((s, r) => s + r.lhcTotal,  0);
    const cpNa    = rows.reduce((s, r) => s + r.cpNa,     0);
    const cpNonNa = rows.reduce((s, r) => s + r.cpNonNa,  0);
    const cpTot   = rows.reduce((s, r) => s + r.cpTotal,   0);
    const cmbNa   = rows.reduce((s, r) => s + r.combinedNa,    0);
    const cmbNonNa= rows.reduce((s, r) => s + r.combinedNonNa, 0);
    const cmbTot  = rows.reduce((s, r) => s + r.combinedTotal, 0);

    const totRow = ws.addRow([
      'TOTAL',
      fmtXl(lhcNa),    fmtXl(lhcNonNa),    fmtXl(lhcTot),
      fmtXl(cpNa),     fmtXl(cpNonNa),     fmtXl(cpTot),
      fmtXl(cmbNa),    fmtXl(cmbNonNa),    fmtXl(cmbTot),
      fmtXl(last.cumNa), fmtXl(last.cumNonNa), fmtXl(last.cumTotal),
    ]);
    totRow.height = 18;
    const totFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
    const totCumFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF154360' } };
    totRow.eachCell((cell, colNum) => {
      cell.fill      = colNum >= 11 ? totCumFill : totFill;
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'left' : 'right' };
    });
    applyGroupBorders(totRow, 'FFFFFFFF');
  }

  await wb.xlsx.write(res);
}

function fmtXl(v: number): number | string { return v === 0 ? '-' : v; }

// Columns 2, 5, 8, 11 start each group; also outer edges at 1 and 13
function applyGroupBorders(row: ExcelJS.Row, color: string): void {
  const medium: ExcelJS.Border = { style: 'medium', color: { argb: color } };
  const thin:   ExcelJS.Border = { style: 'thin',   color: { argb: color } };
  const groupStarts = new Set([2, 5, 8, 11]);

  for (let col = 1; col <= 13; col++) {
    const cell = row.getCell(col);
    cell.border = {
      ...cell.border,
      left:   col === 1 || groupStarts.has(col) ? medium : thin,
      right:  col === 13 ? medium : undefined,
      top:    thin,
      bottom: thin,
    };
  }
}

function dateSuffix(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}
