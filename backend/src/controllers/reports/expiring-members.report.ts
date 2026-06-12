import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { prisma } from '../../utils/prisma';
import { writeAudit } from '../../utils/audit';

const TITLE    = 'LEISURE HOLIDAYS BHD';
const SUBTITLE = 'LIST OF EXPIRING MEMBERS';

const CO_LABELS: Record<string, string> = {
  '03': 'LHC-A (03)', '15': 'LHC-B (15)', '02': 'CP (02)',
};
const CO_ORDER = ['03', '15', '02'];

const ACCT_LABELS: Record<string, string> = {
  NA: 'Active', SU: 'Suspended', PT: 'Pend.Term',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '';
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

function computeExpiry(agreementDate: Date, termYears: number, endDate: Date | null): Date {
  if (endDate) return endDate;
  const d = new Date(agreementDate);
  d.setFullYear(d.getFullYear() + termYears);
  return d;
}

// ─── Row type ──────────────────────────────────────────────────────────────────

interface ExpiringMemberRow {
  coCode: string;
  fullName: string;
  membershipNo: string;
  agreementNo: string;
  agreementDate: Date;
  expiryDate: Date;
  amcBilled: number;
  totalAmc: number;
  acctClassify: string;
}

// ─── Data fetch ────────────────────────────────────────────────────────────────

async function fetchRows(month: number, year: number): Promise<ExpiringMemberRow[]> {
  const agreements = await prisma.agreement.findMany({
    where: { acctClassify: { not: 'TM' } },
    select: {
      coCode: true,
      agreementNo: true,
      agreementDate: true,
      endDate: true,
      termYears: true,
      acctClassify: true,
      member: { select: { fullName: true, membershipNo: true } },
      amcSchedule: { select: { invoicesIssued: true, totalInvoices: true } },
    },
  });

  const rows: ExpiringMemberRow[] = [];

  for (const a of agreements) {
    const expiry = computeExpiry(a.agreementDate, a.termYears, a.endDate);
    if (expiry.getMonth() + 1 !== month || expiry.getFullYear() !== year) continue;
    rows.push({
      coCode:        a.coCode,
      fullName:      a.member?.fullName      ?? '',
      membershipNo:  a.member?.membershipNo  ?? '',
      agreementNo:   a.agreementNo,
      agreementDate: a.agreementDate,
      expiryDate:    expiry,
      amcBilled:     a.amcSchedule?.invoicesIssued ?? 0,
      totalAmc:      a.amcSchedule?.totalInvoices  ?? 0,
      acctClassify:  a.acctClassify,
    });
  }

  rows.sort((a, b) => {
    const coa = CO_ORDER.indexOf(a.coCode);
    const cob = CO_ORDER.indexOf(b.coCode);
    if (coa !== cob) return (coa === -1 ? 99 : coa) - (cob === -1 ? 99 : cob);
    return a.expiryDate.getTime() - b.expiryDate.getTime();
  });

  return rows;
}

// ─── Preview handler ───────────────────────────────────────────────────────────

const PREVIEW_LIMIT = 20;

export async function previewExpiringMembersReport(req: Request, res: Response): Promise<void> {
  const month = parseInt(String(req.query.month ?? ''), 10);
  const year  = parseInt(String(req.query.year  ?? ''), 10);

  if (!month || !year || month < 1 || month > 12) {
    res.status(400).json({ error: 'month (1-12) and year are required' });
    return;
  }

  const all  = await fetchRows(month, year);
  const rows = all.slice(0, PREVIEW_LIMIT).map((r, i) => ({
    no:           i + 1,
    coCode:       CO_LABELS[r.coCode] ?? r.coCode,
    fullName:     r.fullName,
    membershipNo: r.membershipNo,
    agreementNo:  r.agreementNo,
    agreementDate: fmtDate(r.agreementDate),
    expiryDate:   fmtDate(r.expiryDate),
    amcBilled:    r.amcBilled,
    totalAmc:     r.totalAmc,
    acctClassify: ACCT_LABELS[r.acctClassify] ?? r.acctClassify,
  }));

  res.json({ data: rows, meta: { total: all.length, shown: rows.length } });
}

// ─── Generate handler ──────────────────────────────────────────────────────────

export async function generateExpiringMembersReport(req: Request, res: Response): Promise<void> {
  const month  = parseInt(String(req.query.month  ?? ''), 10);
  const year   = parseInt(String(req.query.year   ?? ''), 10);
  const format = String(req.query.format ?? 'excel');

  if (!month || !year || month < 1 || month > 12) {
    res.status(400).json({ error: 'month (1-12) and year are required' });
    return;
  }
  if (format !== 'pdf' && format !== 'excel') {
    res.status(400).json({ error: 'format must be pdf or excel' });
    return;
  }

  const rows = await fetchRows(month, year);

  await writeAudit({
    userId: req.user.id,
    action: `Generated List of Expiring Members report (${format}): ${MONTH_NAMES[month - 1]} ${year}, ${rows.length} records`,
    actionType: 'CREATE',
    targetType: 'Agreement',
    metadata: { month, year, format, count: rows.length },
  });

  if (format === 'pdf') {
    renderPdf(res, rows, month, year);
  } else {
    await renderExcel(res, rows, month, year);
  }
}

// ─── PDF ───────────────────────────────────────────────────────────────────────

const MARGIN  = 20;
const ROW_H   = 14;
const HDR_H   = 16;
const GRP_H   = 14;
const FS      = 7;
const PAD     = 3;

const PDF_COLS = [
  { h: '#',               w: 20  },
  { h: 'Name',            w: 200 },
  { h: 'Membership No.',  w: 95  },
  { h: 'Agreement No.',   w: 88  },
  { h: 'Agreement Date',  w: 84  },
  { h: 'Expiry Date',     w: 84  },
  { h: 'AMC Billed',      w: 76  },
  { h: 'Total AMC',       w: 76  },
  { h: 'Acct Status',     w: 77  },
] as const;

const TOTAL_W = PDF_COLS.reduce((s, c) => s + c.w, 0); // 800

function truncatePdf(doc: PDFKit.PDFDocument, text: string, maxW: number): string {
  const avail = maxW - PAD * 2;
  if (doc.widthOfString(text) <= avail) return text;
  let t = text;
  while (t.length > 1 && doc.widthOfString(t + '...') > avail) t = t.slice(0, -1);
  return t + '...';
}

function drawPdfTableHeader(doc: PDFKit.PDFDocument, y: number): void {
  doc.rect(MARGIN, y, TOTAL_W, HDR_H).fill('#1B4F72');
  doc.fillColor('white').font('Helvetica-Bold').fontSize(FS);
  let cx = MARGIN;
  for (const col of PDF_COLS) {
    doc.text(col.h, cx + PAD, y + Math.floor((HDR_H - FS) / 2), {
      width: col.w - PAD * 2, lineBreak: false,
    });
    cx += col.w;
  }
}

function drawPdfGroupHeader(doc: PDFKit.PDFDocument, label: string, y: number): void {
  doc.rect(MARGIN, y, TOTAL_W, GRP_H).fill('#2E86C1');
  doc.fillColor('white').font('Helvetica-Bold').fontSize(FS);
  doc.text(label, MARGIN + PAD, y + Math.floor((GRP_H - FS) / 2), {
    width: TOTAL_W - PAD * 2, lineBreak: false,
  });
}

function drawPdfDataRow(
  doc: PDFKit.PDFDocument,
  row: ExpiringMemberRow,
  seqNo: number,
  rowIdx: number,
  y: number,
): void {
  const bg = rowIdx % 2 === 0 ? '#FFFFFF' : '#EBF5FB';
  doc.rect(MARGIN, y, TOTAL_W, ROW_H).fill(bg);
  doc.fillColor('#111111').font('Helvetica').fontSize(FS);

  const vals = [
    String(seqNo),
    row.fullName,
    row.membershipNo,
    row.agreementNo,
    fmtDate(row.agreementDate),
    fmtDate(row.expiryDate),
    String(row.amcBilled),
    String(row.totalAmc),
    ACCT_LABELS[row.acctClassify] ?? row.acctClassify,
  ];

  let cx = MARGIN;
  for (let i = 0; i < PDF_COLS.length; i++) {
    const col = PDF_COLS[i];
    const txt = truncatePdf(doc, vals[i], col.w);
    doc.text(txt, cx + PAD, y + Math.floor((ROW_H - FS) / 2), {
      width: col.w - PAD * 2, lineBreak: false,
    });
    cx += col.w;
  }
  doc.moveTo(MARGIN, y + ROW_H).lineTo(MARGIN + TOTAL_W, y + ROW_H)
     .strokeColor('#D5D8DC').lineWidth(0.2).stroke();
}

function renderPdf(res: Response, rows: ExpiringMemberRow[], month: number, year: number): void {
  const dateStr  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const monthYr  = `${MONTH_NAMES[month - 1]} ${year}`;
  const nowStr   = new Date().toLocaleString('en-MY', { hour12: false });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="expiring-members-${year}${String(month).padStart(2, '0')}.pdf"`);

  const doc = new PDFDocument({
    size: 'A4', layout: 'landscape',
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
    const info = `Period: ${monthYr}   |   Total: ${rows.length} records   |   Generated: ${nowStr}`;
    doc.fontSize(6).fillColor('#888888').font('Helvetica');
    doc.text(info, MARGIN, fy, { width: pageW - MARGIN * 2 - 50, lineBreak: false, align: 'left' });
    doc.text(`Page ${pageNum}`, MARGIN, fy, { width: pageW - MARGIN * 2, lineBreak: false, align: 'right' });
  };

  // Title block
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#1B4F72');
  doc.text(TITLE, MARGIN, MARGIN, { width: TOTAL_W, lineBreak: false });
  doc.fontSize(8).font('Helvetica').fillColor('#555555');
  doc.text(
    `${SUBTITLE}   |   Period: ${monthYr}   |   Total: ${rows.length} records`,
    MARGIN, MARGIN + 18, { width: TOTAL_W, lineBreak: false },
  );

  let y = MARGIN + 38;
  drawPdfTableHeader(doc, y);
  y += HDR_H;

  let seqNo      = 1;
  let prevCoCode = '';
  let dataRowIdx = 0;

  for (const row of rows) {
    // Group header when company code changes
    if (row.coCode !== prevCoCode) {
      if (y + GRP_H > bottomLimit) {
        addFooter();
        doc.addPage();
        pageNum++;
        y = MARGIN;
        drawPdfTableHeader(doc, y);
        y += HDR_H;
      }
      drawPdfGroupHeader(doc, CO_LABELS[row.coCode] ?? row.coCode, y);
      y += GRP_H;
      prevCoCode = row.coCode;
      dataRowIdx = 0;
    }

    if (y + ROW_H > bottomLimit) {
      addFooter();
      doc.addPage();
      pageNum++;
      y = MARGIN;
      drawPdfTableHeader(doc, y);
      y += HDR_H;
    }

    drawPdfDataRow(doc, row, seqNo, dataRowIdx, y);
    y += ROW_H;
    seqNo++;
    dataRowIdx++;
  }

  addFooter();
  doc.end();
}

// ─── Excel ─────────────────────────────────────────────────────────────────────

const XL_COLS = [
  { header: '#',                width: 5  },
  { header: 'Name',             width: 36 },
  { header: 'Membership No.',   width: 18 },
  { header: 'Agreement No.',    width: 16 },
  { header: 'Agreement Date',   width: 16 },
  { header: 'Expiry Date',      width: 16 },
  { header: 'AMC Billed',       width: 13 },
  { header: 'Total AMC',        width: 13 },
  { header: 'Acct Status',      width: 14 },
] as const;

const XL_LAST_COL = String.fromCharCode(64 + XL_COLS.length); // 'I' for 9 cols

async function renderExcel(res: Response, rows: ExpiringMemberRow[], month: number, year: number): Promise<void> {
  const monthYr = `${MONTH_NAMES[month - 1]} ${year}`;
  const nowStr  = new Date().toLocaleString('en-MY', { hour12: false });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="expiring-members-${year}${String(month).padStart(2, '0')}.xlsx"`);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LHB MMS';
  wb.created = new Date();
  const ws = wb.addWorksheet('Expiring Members');

  ws.columns = XL_COLS.map(c => ({ width: c.width }));

  // Row 1: title
  const r1 = ws.addRow([SUBTITLE]);
  ws.mergeCells(`A${r1.number}:${XL_LAST_COL}${r1.number}`);
  r1.height = 22;
  r1.getCell(1).font      = { bold: true, size: 14, color: { argb: 'FF1B4F72' } };
  r1.getCell(1).alignment = { vertical: 'middle' };

  // Row 2: subtitle
  const r2 = ws.addRow([`Period: ${monthYr}   |   Generated: ${nowStr}   |   Total: ${rows.length} records`]);
  ws.mergeCells(`A${r2.number}:${XL_LAST_COL}${r2.number}`);
  r2.height = 16;
  r2.getCell(1).font      = { size: 9, color: { argb: 'FF555555' } };
  r2.getCell(1).alignment = { vertical: 'middle' };

  // Row 3: blank
  ws.addRow([]);

  // Row 4: column headers
  const hdrRow = ws.addRow(XL_COLS.map(c => c.header));
  hdrRow.height = 20;
  hdrRow.eachCell(cell => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
    cell.border    = { bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } };
  });
  ws.views      = [{ state: 'frozen', ySplit: hdrRow.number }];
  ws.autoFilter = { from: { row: hdrRow.number, column: 1 }, to: { row: hdrRow.number, column: XL_COLS.length } };

  let seqNo      = 1;
  let prevCoCode = '';
  let dataRowIdx = 0;

  for (const row of rows) {
    // Group header row when company code changes
    if (row.coCode !== prevCoCode) {
      const grpRow = ws.addRow([CO_LABELS[row.coCode] ?? row.coCode]);
      ws.mergeCells(`A${grpRow.number}:${XL_LAST_COL}${grpRow.number}`);
      grpRow.height = 18;
      grpRow.getCell(1).font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      grpRow.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E86C1' } };
      grpRow.getCell(1).alignment = { vertical: 'middle' };
      prevCoCode = row.coCode;
      dataRowIdx = 0;
    }

    const even = dataRowIdx % 2 === 0;
    const bg: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: even ? 'FFFFFFFF' : 'FFEBF5FB' } };

    const dataRow = ws.addRow([
      seqNo,
      row.fullName,
      row.membershipNo,
      row.agreementNo,
      fmtDate(row.agreementDate),
      fmtDate(row.expiryDate),
      row.amcBilled,
      row.totalAmc,
      ACCT_LABELS[row.acctClassify] ?? row.acctClassify,
    ]);
    dataRow.eachCell(cell => {
      cell.fill      = bg;
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });

    seqNo++;
    dataRowIdx++;
  }

  await wb.xlsx.write(res);
}
