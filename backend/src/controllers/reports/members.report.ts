import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { prisma } from '../../utils/prisma';
import { writeAudit } from '../../utils/audit';

const CO_LABELS: Record<string, string> = {
  '03': 'LHC-A (03)', '15': 'LHC-B (15)', '02': 'CP (02)',
};
const AGMT_STATUS_LABELS: Record<string, string> = {
  NA: 'Active', SU: 'Suspended', PT: 'Pend.Term', TM: 'Terminated',
};

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '';
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

async function fetchMembers(
  coCode: string | undefined,
  acctClassify: string | undefined,
) {
  // Build the agreement filter used in both the member WHERE clause and the agreements include
  const agmtFilter: Record<string, unknown> = {};
  if (coCode)       agmtFilter.coCode       = coCode;
  if (acctClassify) agmtFilter.acctClassify = acctClassify;
  const hasAgmtFilter = Object.keys(agmtFilter).length > 0;

  return prisma.member.findMany({
    where: {
      ...(hasAgmtFilter ? { agreements: { some: agmtFilter } } : {}),
    },
    select: {
      membershipNo: true, fullName: true, memberType: true, status: true,
      icNew: true, icOld: true, email: true, telMobile: true, telHome: true,
      mailAdd1: true, mailAdd2: true, mailAdd3: true, mailCityState: true, mailPostcode: true,
      agreements: {
        where: hasAgmtFilter ? agmtFilter : {},
        select: {
          agreementNo: true, coCode: true,
          agreementDate: true, acctClassify: true,
        },
        orderBy: { agreementDate: 'asc' },
      },
    },
    orderBy: { fullName: 'asc' },
  });
}

type FetchedMember = Awaited<ReturnType<typeof fetchMembers>>[0];

// ─── PDF ───────────────────────────────────────────────────────────────────────

const PDF_COLS = [
  { h: '#',               key: 'no',          w: 20  },
  { h: 'Membership No.',  key: 'memNo',        w: 75  },
  { h: 'Full Name',       key: 'fullName',     w: 100 },
  { h: 'IC New',          key: 'icNew',        w: 75  },
  { h: 'IC Old',          key: 'icOld',        w: 68  },
  { h: 'Tel Mobile',      key: 'telMobile',    w: 65  },
  { h: 'Email',           key: 'email',        w: 110 },
  { h: 'Mailing Address', key: 'mailAddr',     w: 135 },
  { h: 'Co Code',         key: 'coCode',       w: 32  },
  { h: 'Agreement No.',   key: 'agmtNos',      w: 68  },
  { h: 'Agmt Status',     key: 'agmtStatus',   w: 52  },
] as const;

type PdfRowKey = typeof PDF_COLS[number]['key'];
type PdfRow = Record<PdfRowKey, string>;

const MARGIN = 20;
const ROW_H  = 14;
const HDR_H  = 16;
const FS     = 7;
const PAD    = 3;
const TOTAL_W = PDF_COLS.reduce((s, c) => s + c.w, 0);

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

function drawPdfDataRow(doc: PDFKit.PDFDocument, row: PdfRow, rowIdx: number, y: number): void {
  const bg = rowIdx % 2 === 0 ? '#FFFFFF' : '#EBF5FB';
  doc.rect(MARGIN, y, TOTAL_W, ROW_H).fill(bg);
  doc.fillColor('#111111').font('Helvetica').fontSize(FS);
  let cx = MARGIN;
  for (const col of PDF_COLS) {
    const txt = truncatePdf(doc, row[col.key], col.w);
    doc.text(txt, cx + PAD, y + Math.floor((ROW_H - FS) / 2), {
      width: col.w - PAD * 2, lineBreak: false,
    });
    cx += col.w;
  }
  doc.moveTo(MARGIN, y + ROW_H).lineTo(MARGIN + TOTAL_W, y + ROW_H)
     .strokeColor('#D5D8DC').lineWidth(0.2).stroke();
}

function buildPdfRow(m: FetchedMember, idx: number): PdfRow {
  const agmts = m.agreements;
  return {
    no:         String(idx + 1),
    memNo:      m.membershipNo ?? '',
    fullName:   m.fullName ?? '',
    icNew:      m.icNew ?? '',
    icOld:      m.icOld ?? '',
    telMobile:  m.telMobile ?? '',
    email:      m.email ?? '',
    mailAddr:   [m.mailAdd1, m.mailAdd2, m.mailAdd3, m.mailCityState, m.mailPostcode]
                  .filter(Boolean).join(', '),
    coCode:     [...new Set(agmts.map(a => a.coCode))].join(', '),
    agmtNos:    agmts.map(a => a.agreementNo).join(', '),
    agmtStatus: [...new Set(agmts.map(a => AGMT_STATUS_LABELS[a.acctClassify] ?? a.acctClassify))].join(', '),
  };
}

function generatePdf(
  members: FetchedMember[],
  filters: { coCode?: string; acctClassify?: string },
  res: Response,
): void {
  const dateStr  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const coLabel  = filters.coCode ? (CO_LABELS[filters.coCode] ?? filters.coCode) : 'All';
  const agmtStatusLabel = filters.acctClassify ? (AGMT_STATUS_LABELS[filters.acctClassify] ?? filters.acctClassify) : 'All';
  const nowStr   = new Date().toLocaleString('en-MY', { hour12: false });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="members-report-${dateStr}.pdf"`);

  const doc = new PDFDocument({
    size: 'A4', layout: 'landscape',
    // bottom: 0 so pdfkit's maxY = pageH; footerY (pageH-14) would otherwise exceed
    // maxY (pageH-20) and trigger automatic page breaks in the footer text calls.
    // The bottomLimit guard below controls where data rows actually stop.
    margins: { top: MARGIN, bottom: 0, left: MARGIN, right: MARGIN },
    autoFirstPage: true,
    info: { Title: 'Member Detail Listing', Author: 'LHB MMS' },
  });
  doc.pipe(res);

  const pageH      = doc.page.height;
  const pageW      = doc.page.width;
  let   pageNum    = 1;
  const bottomLimit = pageH - 24;

  const addFooter = () => {
    const footerY = pageH - 14;
    const info = `Co Code: ${coLabel}   |   Agmt Status: ${agmtStatusLabel}   |   Generated: ${nowStr}`;
    doc.fontSize(6).fillColor('#888888').font('Helvetica');
    doc.text(info, MARGIN, footerY, { width: pageW - MARGIN * 2 - 50, lineBreak: false, align: 'left' });
    doc.text(`Page ${pageNum}`, MARGIN, footerY, { width: pageW - MARGIN * 2, lineBreak: false, align: 'right' });
  };

  // Title
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#1B4F72');
  doc.text('Member Detail Listing', MARGIN, MARGIN, { width: TOTAL_W, lineBreak: false });
  doc.fontSize(8).font('Helvetica').fillColor('#555555');
  doc.text(
    `Company Code: ${coLabel}   |   Agmt Status: ${agmtStatusLabel}   |   Total: ${members.length} records`,
    MARGIN, MARGIN + 18, { width: TOTAL_W, lineBreak: false },
  );

  // Table
  let y = MARGIN + 38;
  drawPdfTableHeader(doc, y);
  y += HDR_H;

  for (let i = 0; i < members.length; i++) {
    if (y + ROW_H > bottomLimit) {
      addFooter();
      doc.addPage();
      pageNum++;
      y = MARGIN;
      drawPdfTableHeader(doc, y);
      y += HDR_H;
    }
    drawPdfDataRow(doc, buildPdfRow(members[i], i), i, y);
    y += ROW_H;
  }

  addFooter();
  doc.end();
}

// ─── Excel ─────────────────────────────────────────────────────────────────────

const XL_COLS = [
  { header: '#',                    width: 5  },
  { header: 'Membership No.',       width: 20 },
  { header: 'Full Name',            width: 30 },
  { header: 'Member Type',          width: 12 },
  { header: 'IC New',               width: 16 },
  { header: 'IC Old',               width: 16 },
  { header: 'Tel Mobile',           width: 16 },
  { header: 'Tel Home',             width: 16 },
  { header: 'Email',                width: 32 },
  { header: 'Mail Address 1',       width: 28 },
  { header: 'Mail Address 2',       width: 28 },
  { header: 'Mail Address 3',       width: 20 },
  { header: 'City/State',           width: 22 },
  { header: 'Postcode',             width: 10 },
  { header: 'Company Code',         width: 14 },
  { header: 'Agreement No(s).',     width: 22 },
  { header: 'Agreement Date(s)',    width: 22 },
  { header: 'Agreement Status',     width: 18 },
] as const;

const XL_LAST_COL = String.fromCharCode(64 + XL_COLS.length); // 'R' for 18 cols

async function generateExcel(
  members: FetchedMember[],
  filters: { coCode?: string; acctClassify?: string },
  res: Response,
): Promise<void> {
  const dateStr  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const coLabel  = filters.coCode ? (CO_LABELS[filters.coCode] ?? filters.coCode) : 'All';
  const agmtStatusLabel = filters.acctClassify ? (AGMT_STATUS_LABELS[filters.acctClassify] ?? filters.acctClassify) : 'All';
  const nowStr   = new Date().toLocaleString('en-MY', { hour12: false });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="members-report-${dateStr}.xlsx"`);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LHB MMS';
  wb.created = new Date();
  const ws = wb.addWorksheet('Members');

  ws.columns = XL_COLS.map(c => ({ width: c.width }));

  // Row 1: title
  const r1 = ws.addRow(['Member Detail Listing']);
  ws.mergeCells(`A${r1.number}:${XL_LAST_COL}${r1.number}`);
  r1.height = 22;
  r1.getCell(1).font  = { bold: true, size: 14, color: { argb: 'FF1B4F72' } };
  r1.getCell(1).alignment = { vertical: 'middle' };

  // Row 2: subtitle
  const r2 = ws.addRow([`Company Code: ${coLabel}   |   Agmt Status: ${agmtStatusLabel}   |   Generated: ${nowStr}   |   Total: ${members.length} records`]);
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
  ws.views     = [{ state: 'frozen', ySplit: hdrRow.number }];
  ws.autoFilter = { from: { row: hdrRow.number, column: 1 }, to: { row: hdrRow.number, column: XL_COLS.length } };

  // Data rows
  for (let i = 0; i < members.length; i++) {
    const m     = members[i];
    const agmts = m.agreements;
    const row = ws.addRow([
      i + 1,
      m.membershipNo ?? '',
      m.fullName     ?? '',
      m.memberType === 'INDIVIDUAL' ? 'Individual' : 'Corporate',
      m.icNew        ?? '',
      m.icOld        ?? '',
      m.telMobile    ?? '',
      m.telHome      ?? '',
      m.email        ?? '',
      m.mailAdd1     ?? '',
      m.mailAdd2     ?? '',
      m.mailAdd3     ?? '',
      m.mailCityState ?? '',
      m.mailPostcode ?? '',
      [...new Set(agmts.map(a => a.coCode))].join(', '),
      agmts.map(a => a.agreementNo).join(', '),
      agmts.map(a => fmtDate(a.agreementDate)).join(', '),
      [...new Set(agmts.map(a => AGMT_STATUS_LABELS[a.acctClassify] ?? a.acctClassify))].join(', '),
    ]);
    const bg = i % 2 === 0 ? 'FFFFFFFF' : 'FFEBF5FB';
    row.eachCell(cell => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });
  }

  await wb.xlsx.write(res);
}

// ─── Preview handler ───────────────────────────────────────────────────────────

const PREVIEW_LIMIT = 20;

export async function previewMembersReport(req: Request, res: Response): Promise<void> {
  const { coCode, acctClassify } = req.query as Record<string, string>;

  const agmtFilter: Record<string, unknown> = {};
  if (coCode)       agmtFilter.coCode       = coCode;
  if (acctClassify) agmtFilter.acctClassify = acctClassify;
  const hasAgmtFilter = Object.keys(agmtFilter).length > 0;

  const where = {
    ...(hasAgmtFilter ? { agreements: { some: agmtFilter } } : {}),
  };

  const [total, members] = await Promise.all([
    prisma.member.count({ where }),
    prisma.member.findMany({
      where,
      select: {
        membershipNo: true, fullName: true, memberType: true, status: true,
        icNew: true, icOld: true, email: true, telMobile: true,
        mailAdd1: true, mailAdd2: true, mailAdd3: true, mailCityState: true, mailPostcode: true,
        agreements: {
          where: hasAgmtFilter ? agmtFilter : {},
          select: { agreementNo: true, coCode: true, agreementDate: true, acctClassify: true },
          orderBy: { agreementDate: 'asc' },
        },
      },
      orderBy: { fullName: 'asc' },
      take: PREVIEW_LIMIT,
    }),
  ]);

  const rows = members.map((m, i) => {
    const agmts = m.agreements;
    return {
      no:           i + 1,
      membershipNo: m.membershipNo ?? '',
      fullName:     m.fullName ?? '',
      memberType:   m.memberType === 'INDIVIDUAL' ? 'Individual' : 'Corporate',
      icNew:        m.icNew ?? '',
      icOld:        m.icOld ?? '',
      telMobile:    m.telMobile ?? '',
      email:        m.email ?? '',
      mailAddr:     [m.mailAdd1, m.mailAdd2, m.mailAdd3, m.mailCityState, m.mailPostcode]
                      .filter(Boolean).join(', '),
      coCode:       [...new Set(agmts.map(a => a.coCode))].join(', '),
      agmtNos:      agmts.map(a => a.agreementNo).join(', '),
      agmtStatus:   [...new Set(agmts.map(a => AGMT_STATUS_LABELS[a.acctClassify] ?? a.acctClassify))].join(', '),
    };
  });

  res.json({ data: rows, meta: { total, shown: rows.length } });
}

// ─── Main handler ──────────────────────────────────────────────────────────────

export async function generateMembersReport(req: Request, res: Response): Promise<void> {
  const { coCode, acctClassify, format } = req.query as Record<string, string>;

  if (format !== 'pdf' && format !== 'excel') {
    res.status(400).json({ error: 'format must be pdf or excel' });
    return;
  }

  const members = await fetchMembers(coCode || undefined, acctClassify || undefined);

  await writeAudit({
    userId: req.user.id,
    action: `Generated members report (${format}): ${members.length} records`,
    actionType: 'CREATE',
    targetType: 'Member',
    metadata: {
      coCode:       coCode       || 'All',
      acctClassify: acctClassify || 'All',
      format,
      count:        members.length,
    },
  });

  const filters = {
    coCode:       coCode       || undefined,
    acctClassify: acctClassify || undefined,
  };

  if (format === 'pdf') {
    generatePdf(members, filters, res);
  } else {
    await generateExcel(members, filters, res);
  }
}
