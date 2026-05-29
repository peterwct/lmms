import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { prisma } from '../../utils/prisma';
import { writeAudit } from '../../utils/audit';

const CO_LABELS: Record<string, string> = {
  '03': 'LHC-A (03)', '15': 'LHC-B (15)', '02': 'CP (02)',
};

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '';
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

function buildCoCodeWhere(coCode: string | undefined): Record<string, unknown> {
  if (!coCode) return {};
  if (coCode === 'LHC') return { coCode: { in: ['03', '15'] } };
  if (coCode === 'CP')  return { coCode: '02' };
  return { coCode };
}

function coLabel(coCode: string | undefined): string {
  if (!coCode) return 'All';
  if (coCode === 'LHC') return 'LHC (03 + 15)';
  if (coCode === 'CP')  return 'CP (02)';
  return CO_LABELS[coCode] ?? coCode;
}

// ─── Shared PDF primitives ─────────────────────────────────────────────────────

const MARGIN = 20;
const ROW_H  = 14;
const HDR_H  = 16;
const FS     = 7;
const PAD    = 3;

type PdfColDef = { h: string; w: number };

function truncatePdf(doc: PDFKit.PDFDocument, text: string, maxW: number): string {
  const avail = maxW - PAD * 2;
  if (doc.widthOfString(text) <= avail) return text;
  let t = text;
  while (t.length > 1 && doc.widthOfString(t + '...') > avail) t = t.slice(0, -1);
  return t + '...';
}

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  y: number,
  cols: readonly PdfColDef[],
  totalW: number,
): void {
  doc.rect(MARGIN, y, totalW, HDR_H).fill('#1B4F72');
  doc.fillColor('white').font('Helvetica-Bold').fontSize(FS);
  let cx = MARGIN;
  for (const col of cols) {
    doc.text(col.h, cx + PAD, y + Math.floor((HDR_H - FS) / 2), {
      width: col.w - PAD * 2, lineBreak: false,
    });
    cx += col.w;
  }
}

function drawDataRow(
  doc: PDFKit.PDFDocument,
  values: string[],
  rowIdx: number,
  y: number,
  cols: readonly PdfColDef[],
  totalW: number,
): void {
  const bg = rowIdx % 2 === 0 ? '#FFFFFF' : '#EBF5FB';
  doc.rect(MARGIN, y, totalW, ROW_H).fill(bg);
  doc.fillColor('#111111').font('Helvetica').fontSize(FS);
  let cx = MARGIN;
  for (let i = 0; i < cols.length; i++) {
    const txt = truncatePdf(doc, values[i] ?? '', cols[i].w);
    doc.text(txt, cx + PAD, y + Math.floor((ROW_H - FS) / 2), {
      width: cols[i].w - PAD * 2, lineBreak: false,
    });
    cx += cols[i].w;
  }
  doc.moveTo(MARGIN, y + ROW_H).lineTo(MARGIN + totalW, y + ROW_H)
     .strokeColor('#D5D8DC').lineWidth(0.2).stroke();
}

function renderPdf(
  res: Response,
  filename: string,
  title: string,
  subtitle: string,
  footerInfo: string,
  cols: readonly PdfColDef[],
  rows: string[][],
): void {
  const totalW = cols.reduce((s, c) => s + c.w, 0);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({
    size: 'A4', layout: 'landscape',
    margins: { top: MARGIN, bottom: 0, left: MARGIN, right: MARGIN },
    autoFirstPage: true,
    info: { Title: title, Author: 'LHB MMS' },
  });
  doc.pipe(res);

  const pageH       = doc.page.height;
  const pageW       = doc.page.width;
  let   pageNum     = 1;
  const bottomLimit = pageH - 24;

  const addFooter = () => {
    const footerY = pageH - 14;
    doc.fontSize(6).fillColor('#888888').font('Helvetica');
    doc.text(footerInfo, MARGIN, footerY, { width: pageW - MARGIN * 2 - 50, lineBreak: false, align: 'left' });
    doc.text(`Page ${pageNum}`, MARGIN, footerY, { width: pageW - MARGIN * 2, lineBreak: false, align: 'right' });
  };

  doc.fontSize(13).font('Helvetica-Bold').fillColor('#1B4F72');
  doc.text(title, MARGIN, MARGIN, { width: totalW, lineBreak: false });
  doc.fontSize(8).font('Helvetica').fillColor('#555555');
  doc.text(subtitle, MARGIN, MARGIN + 18, { width: totalW, lineBreak: false });

  let y = MARGIN + 38;
  drawTableHeader(doc, y, cols, totalW);
  y += HDR_H;

  for (let i = 0; i < rows.length; i++) {
    if (y + ROW_H > bottomLimit) {
      addFooter();
      doc.addPage();
      pageNum++;
      y = MARGIN;
      drawTableHeader(doc, y, cols, totalW);
      y += HDR_H;
    }
    drawDataRow(doc, rows[i], i, y, cols, totalW);
    y += ROW_H;
  }

  addFooter();
  doc.end();
}

// ─── Shared Excel primitive ────────────────────────────────────────────────────

type XlColDef = { header: string; width: number };

async function renderExcel(
  res: Response,
  filename: string,
  sheetName: string,
  title: string,
  subtitle: string,
  cols: readonly XlColDef[],
  rows: (string | number)[][],
): Promise<void> {
  const lastCol = String.fromCharCode(64 + cols.length);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LHB MMS';
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName);

  ws.columns = cols.map(c => ({ width: c.width }));

  const r1 = ws.addRow([title]);
  ws.mergeCells(`A${r1.number}:${lastCol}${r1.number}`);
  r1.height = 22;
  r1.getCell(1).font      = { bold: true, size: 14, color: { argb: 'FF1B4F72' } };
  r1.getCell(1).alignment = { vertical: 'middle' };

  const r2 = ws.addRow([subtitle]);
  ws.mergeCells(`A${r2.number}:${lastCol}${r2.number}`);
  r2.height = 16;
  r2.getCell(1).font      = { size: 9, color: { argb: 'FF555555' } };
  r2.getCell(1).alignment = { vertical: 'middle' };

  ws.addRow([]);

  const hdrRow = ws.addRow(cols.map(c => c.header));
  hdrRow.height = 20;
  hdrRow.eachCell(cell => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
    cell.border    = { bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } };
  });
  ws.views      = [{ state: 'frozen', ySplit: hdrRow.number }];
  ws.autoFilter = { from: { row: hdrRow.number, column: 1 }, to: { row: hdrRow.number, column: cols.length } };

  for (let i = 0; i < rows.length; i++) {
    const row = ws.addRow(rows[i]);
    const bg  = i % 2 === 0 ? 'FFFFFFFF' : 'FFEBF5FB';
    row.eachCell(cell => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });
  }

  await wb.xlsx.write(res);
}

// ─── Individual ────────────────────────────────────────────────────────────────

const PDF_COLS_IND = [
  { h: '#',                 w: 16  },
  { h: 'Agreement No.',     w: 58  },
  { h: 'Agmt Date',         w: 55  },
  { h: 'Member Name',       w: 85  },
  { h: 'Old IC / Passport', w: 62  },
  { h: 'New IC No.',        w: 62  },
  { h: 'Date of Birth',     w: 50  },
  { h: 'Sex',               w: 22  },
  { h: 'Race',              w: 40  },
  { h: 'Nationality',       w: 58  },
  { h: 'Mailing Address',   w: 108 },
  { h: 'Tel No.',           w: 52  },
  { h: 'Mobile No.',        w: 52  },
  { h: 'Email',             w: 81  },
] as const satisfies readonly PdfColDef[];

const XL_COLS_IND = [
  { header: '#',                 width: 5  },
  { header: 'Agreement No.',     width: 18 },
  { header: 'Agreement Date',    width: 14 },
  { header: 'Member Name',       width: 32 },
  { header: 'Old IC / Passport', width: 18 },
  { header: 'New IC No.',        width: 18 },
  { header: 'Date of Birth',     width: 14 },
  { header: 'Sex',               width: 8  },
  { header: 'Race',              width: 14 },
  { header: 'Nationality',       width: 16 },
  { header: 'Mail Address 1',    width: 28 },
  { header: 'Mail Address 2',    width: 28 },
  { header: 'Mail Address 3',    width: 20 },
  { header: 'City/State',        width: 22 },
  { header: 'Postcode',          width: 10 },
  { header: 'Tel No.',           width: 16 },
  { header: 'Mobile No.',        width: 16 },
  { header: 'Email Address',     width: 32 },
] as const satisfies readonly XlColDef[];

async function fetchAgreementsInd(coCode: string | undefined) {
  return prisma.agreement.findMany({
    where: {
      acctClassify: 'NA',
      member: { memberType: 'INDIVIDUAL' },
      ...buildCoCodeWhere(coCode),
    },
    select: {
      agreementNo: true, agreementDate: true,
      member: {
        select: {
          fullName: true, icOld: true, icNew: true,
          dateOfBirth: true, gender: true, race: true, nationality: true,
          mailAdd1: true, mailAdd2: true, mailAdd3: true,
          mailCityState: true, mailPostcode: true,
          telHome: true, telMobile: true, email: true,
        },
      },
    },
    orderBy: { agreementNo: 'asc' },
  });
}

type FetchedInd = Awaited<ReturnType<typeof fetchAgreementsInd>>[0];

function indToPdfRow(a: FetchedInd, idx: number): string[] {
  const m = a.member;
  return [
    String(idx + 1),
    a.agreementNo ?? '',
    fmtDate(a.agreementDate),
    m.fullName ?? '',
    m.icOld ?? '',
    m.icNew ?? '',
    fmtDate(m.dateOfBirth),
    m.gender ?? '',
    m.race ?? '',
    m.nationality ?? '',
    [m.mailAdd1, m.mailAdd2, m.mailAdd3, m.mailCityState, m.mailPostcode].filter(Boolean).join(', '),
    m.telHome ?? '',
    m.telMobile ?? '',
    m.email ?? '',
  ];
}

function indToXlRow(a: FetchedInd, idx: number): (string | number)[] {
  const m = a.member;
  return [
    idx + 1,
    a.agreementNo ?? '',
    fmtDate(a.agreementDate),
    m.fullName ?? '',
    m.icOld ?? '',
    m.icNew ?? '',
    fmtDate(m.dateOfBirth),
    m.gender ?? '',
    m.race ?? '',
    m.nationality ?? '',
    m.mailAdd1 ?? '',
    m.mailAdd2 ?? '',
    m.mailAdd3 ?? '',
    m.mailCityState ?? '',
    m.mailPostcode ?? '',
    m.telHome ?? '',
    m.telMobile ?? '',
    m.email ?? '',
  ];
}

// ─── Corporate ─────────────────────────────────────────────────────────────────

const PDF_COLS_CORP = [
  { h: '#',               w: 22  },
  { h: 'Agreement No.',   w: 88  },
  { h: 'Agreement Date',  w: 76  },
  { h: 'Company Name',    w: 186 },
  { h: 'Reg. No.',        w: 120 },
  { h: 'Mailing Address', w: 309 },
] as const satisfies readonly PdfColDef[];

const XL_COLS_CORP = [
  { header: '#',              width: 5  },
  { header: 'Agreement No.',  width: 18 },
  { header: 'Agreement Date', width: 14 },
  { header: 'Company Name',   width: 40 },
  { header: 'Reg. No.',       width: 22 },
  { header: 'Mail Address 1', width: 28 },
  { header: 'Mail Address 2', width: 28 },
  { header: 'Mail Address 3', width: 20 },
  { header: 'City/State',     width: 22 },
  { header: 'Postcode',       width: 10 },
] as const satisfies readonly XlColDef[];

async function fetchAgreementsCorp(coCode: string | undefined) {
  return prisma.agreement.findMany({
    where: {
      acctClassify: 'NA',
      member: { memberType: 'CORPORATE' },
      ...buildCoCodeWhere(coCode),
    },
    select: {
      agreementNo: true, agreementDate: true,
      member: {
        select: {
          fullName: true, registrationNo: true,
          mailAdd1: true, mailAdd2: true, mailAdd3: true,
          mailCityState: true, mailPostcode: true,
        },
      },
    },
    orderBy: { agreementNo: 'asc' },
  });
}

type FetchedCorp = Awaited<ReturnType<typeof fetchAgreementsCorp>>[0];

function corpToPdfRow(a: FetchedCorp, idx: number): string[] {
  const m = a.member;
  return [
    String(idx + 1),
    a.agreementNo ?? '',
    fmtDate(a.agreementDate),
    m.fullName ?? '',
    m.registrationNo ?? '',
    [m.mailAdd1, m.mailAdd2, m.mailAdd3, m.mailCityState, m.mailPostcode].filter(Boolean).join(', '),
  ];
}

function corpToXlRow(a: FetchedCorp, idx: number): (string | number)[] {
  const m = a.member;
  return [
    idx + 1,
    a.agreementNo ?? '',
    fmtDate(a.agreementDate),
    m.fullName ?? '',
    m.registrationNo ?? '',
    m.mailAdd1 ?? '',
    m.mailAdd2 ?? '',
    m.mailAdd3 ?? '',
    m.mailCityState ?? '',
    m.mailPostcode ?? '',
  ];
}

// ─── Preview handler ───────────────────────────────────────────────────────────

const PREVIEW_LIMIT = 20;

export async function previewAgreementsReport(req: Request, res: Response): Promise<void> {
  const { coCode, memberType } = req.query as Record<string, string>;
  const isCorp = memberType === 'CORPORATE';

  if (isCorp) {
    const where = {
      acctClassify: 'NA' as const,
      member: { memberType: 'CORPORATE' as const },
      ...buildCoCodeWhere(coCode || undefined),
    };
    const [total, agreements] = await Promise.all([
      prisma.agreement.count({ where }),
      prisma.agreement.findMany({
        where,
        select: {
          agreementNo: true, agreementDate: true,
          member: {
            select: {
              fullName: true, registrationNo: true,
              mailAdd1: true, mailAdd2: true, mailAdd3: true,
              mailCityState: true, mailPostcode: true,
            },
          },
        },
        orderBy: { agreementNo: 'asc' },
        take: PREVIEW_LIMIT,
      }),
    ]);
    const rows = agreements.map((a, i) => ({
      no:             i + 1,
      agmtNo:         a.agreementNo ?? '',
      agmtDate:       fmtDate(a.agreementDate),
      fullName:       a.member.fullName ?? '',
      registrationNo: a.member.registrationNo ?? '',
      mailAddr:       [a.member.mailAdd1, a.member.mailAdd2, a.member.mailAdd3,
                       a.member.mailCityState, a.member.mailPostcode].filter(Boolean).join(', '),
    }));
    res.json({ data: rows, meta: { total, shown: rows.length } });
    return;
  }

  // Individual (default)
  const where = {
    acctClassify: 'NA' as const,
    member: { memberType: 'INDIVIDUAL' as const },
    ...buildCoCodeWhere(coCode || undefined),
  };
  const [total, agreements] = await Promise.all([
    prisma.agreement.count({ where }),
    prisma.agreement.findMany({
      where,
      select: {
        agreementNo: true, agreementDate: true,
        member: {
          select: {
            fullName: true, icOld: true, icNew: true,
            dateOfBirth: true, gender: true, race: true, nationality: true,
            mailAdd1: true, mailAdd2: true, mailAdd3: true,
            mailCityState: true, mailPostcode: true,
            telHome: true, telMobile: true, email: true,
          },
        },
      },
      orderBy: { agreementNo: 'asc' },
      take: PREVIEW_LIMIT,
    }),
  ]);
  const rows = agreements.map((a, i) => {
    const m = a.member;
    return {
      no:          i + 1,
      agmtNo:      a.agreementNo ?? '',
      agmtDate:    fmtDate(a.agreementDate),
      fullName:    m.fullName ?? '',
      icOld:       m.icOld ?? '',
      icNew:       m.icNew ?? '',
      dob:         fmtDate(m.dateOfBirth),
      gender:      m.gender ?? '',
      race:        m.race ?? '',
      nationality: m.nationality ?? '',
      mailAddr:    [m.mailAdd1, m.mailAdd2, m.mailAdd3, m.mailCityState, m.mailPostcode]
                     .filter(Boolean).join(', '),
      telHome:     m.telHome ?? '',
      telMobile:   m.telMobile ?? '',
      email:       m.email ?? '',
    };
  });
  res.json({ data: rows, meta: { total, shown: rows.length } });
}

// ─── Main handler ──────────────────────────────────────────────────────────────

export async function generateAgreementsReport(req: Request, res: Response): Promise<void> {
  const { coCode, memberType, format } = req.query as Record<string, string>;

  if (format !== 'pdf' && format !== 'excel') {
    res.status(400).json({ error: 'format must be pdf or excel' });
    return;
  }

  const isCorp  = memberType === 'CORPORATE';
  const coStr   = coLabel(coCode || undefined);
  const memStr  = isCorp ? 'Corporate' : 'Individual';
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const nowStr  = new Date().toLocaleString('en-MY', { hour12: false });

  const title    = 'Agreement Detail Report';
  const filename = `agreement-detail-report-${dateStr}`;

  if (isCorp) {
    const agreements = await fetchAgreementsCorp(coCode || undefined);

    await writeAudit({
      userId: req.user.id,
      action: `Generated agreement detail report (${format}, Corporate): ${agreements.length} records`,
      actionType: 'CREATE',
      targetType: 'Agreement',
      metadata: { coCode: coCode || 'All', memberType: 'CORPORATE', format, count: agreements.length },
    });

    const subtitle    = `Company Code: ${coStr}   |   Status: Active   |   Member Type: ${memStr}   |   Generated: ${nowStr}   |   Total: ${agreements.length} records`;
    const footerInfo  = `Company Code: ${coStr}   |   Status: Active   |   Member Type: ${memStr}   |   Generated: ${nowStr}`;
    const pdfRows     = agreements.map((a, i) => corpToPdfRow(a, i));
    const xlRows      = agreements.map((a, i) => corpToXlRow(a, i));

    if (format === 'pdf') {
      renderPdf(res, `${filename}.pdf`, title, subtitle, footerInfo, PDF_COLS_CORP, pdfRows);
    } else {
      await renderExcel(res, `${filename}.xlsx`, 'Agreement Detail', title, subtitle, XL_COLS_CORP, xlRows);
    }
    return;
  }

  // Individual
  const agreements = await fetchAgreementsInd(coCode || undefined);

  await writeAudit({
    userId: req.user.id,
    action: `Generated agreement detail report (${format}, Individual): ${agreements.length} records`,
    actionType: 'CREATE',
    targetType: 'Agreement',
    metadata: { coCode: coCode || 'All', memberType: 'INDIVIDUAL', format, count: agreements.length },
  });

  const subtitle   = `Company Code: ${coStr}   |   Status: Active   |   Member Type: ${memStr}   |   Generated: ${nowStr}   |   Total: ${agreements.length} records`;
  const footerInfo = `Company Code: ${coStr}   |   Status: Active   |   Member Type: ${memStr}   |   Generated: ${nowStr}`;
  const pdfRows    = agreements.map((a, i) => indToPdfRow(a, i));
  const xlRows     = agreements.map((a, i) => indToXlRow(a, i));

  if (format === 'pdf') {
    renderPdf(res, `${filename}.pdf`, title, subtitle, footerInfo, PDF_COLS_IND, pdfRows);
  } else {
    await renderExcel(res, `${filename}.xlsx`, 'Agreement Detail', title, subtitle, XL_COLS_IND, xlRows);
  }
}
