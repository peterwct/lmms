import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../../utils/prisma';
import { writeAudit } from '../../utils/audit';

const SUBTITLE_CLAIM = 'Zurich PBS Claim Listing';
const SUBTITLE_ND    = 'Zurich Natural Death Claim Listing';

interface ClaimRow {
  certNo: string;
  membershipNo: string;
  agreementNo: string;
  fullName: string;
  maturityDate: Date | null;
  claimAmt: number;
  docNo: string;
  pymtFromTrustee: Date | null;
  pymtDateToMem: Date | null;
  claimType: string;
  payTo: string;
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '';
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${d.getFullYear()}`;
}

async function fetchClaimRows(ndOnly: boolean): Promise<ClaimRow[]> {
  const rows: Array<{
    cert_no: string | null;
    membership_no: string;
    agreement_no: string;
    full_name: string;
    maturity_date: Date | null;
    claim_amt: number;
    doc_no: string | null;
    pymt_from_trustee: Date | null;
    pymt_date_to_mem: Date | null;
    claim_type: string | null;
    claimant: string | null;
  }> = ndOnly
    ? await prisma.$queryRaw`
        SELECT
          ps."certNo"       AS cert_no,
          a."membershipNo"  AS membership_no,
          c."agreementNo"   AS agreement_no,
          m."fullName"      AS full_name,
          ps."paybackDate"  AS maturity_date,
          c."claimAmt"::float AS claim_amt,
          c."docNo"         AS doc_no,
          c."docDate"       AS pymt_from_trustee,
          c."trustPaidDate" AS pymt_date_to_mem,
          c."claimType"     AS claim_type,
          c."claimant"      AS claimant
        FROM "PbsClaim" c
        JOIN "PbsScheme" ps ON ps."id" = c."pbsSchemeId"
        JOIN "Agreement" a
          ON a."agreementNo" = ps."agreementNo"
          AND a."coCode" = ps."coCode"
          AND a."transferFlag" IS DISTINCT FROM 'TT'
        JOIN "Member" m ON m."id" = a."memberId"
        WHERE c."claimType" = 'ND'
        ORDER BY c."docDate" DESC NULLS LAST, c."trustPaidDate" DESC NULLS LAST
      `
    : await prisma.$queryRaw`
        SELECT
          ps."certNo"       AS cert_no,
          a."membershipNo"  AS membership_no,
          c."agreementNo"   AS agreement_no,
          m."fullName"      AS full_name,
          ps."paybackDate"  AS maturity_date,
          c."claimAmt"::float AS claim_amt,
          c."docNo"         AS doc_no,
          c."docDate"       AS pymt_from_trustee,
          c."trustPaidDate" AS pymt_date_to_mem,
          c."claimType"     AS claim_type,
          c."claimant"      AS claimant
        FROM "PbsClaim" c
        JOIN "PbsScheme" ps ON ps."id" = c."pbsSchemeId"
        JOIN "Agreement" a
          ON a."agreementNo" = ps."agreementNo"
          AND a."coCode" = ps."coCode"
          AND a."transferFlag" IS DISTINCT FROM 'TT'
        JOIN "Member" m ON m."id" = a."memberId"
        WHERE c."claimType" IS DISTINCT FROM 'ND'
        ORDER BY c."docDate" DESC NULLS LAST, c."trustPaidDate" DESC NULLS LAST
      `;

  return rows.map(r => ({
    certNo:          r.cert_no ?? '',
    membershipNo:    r.membership_no,
    agreementNo:     r.agreement_no,
    fullName:        r.full_name,
    maturityDate:    r.maturity_date,
    claimAmt:        Number(r.claim_amt),
    docNo:           r.doc_no ?? '',
    pymtFromTrustee: r.pymt_from_trustee,
    pymtDateToMem:   r.pymt_date_to_mem,
    claimType:       r.claim_type ?? '',
    payTo:           r.claimant === 'LHB' ? 'LHB' : '',
  }));
}

// ── Preview ─────────────────────────────────────────────────────────────────

export async function previewPbsClaimReport(req: Request, res: Response): Promise<void> {
  const [claimRows, ndRows] = await Promise.all([
    fetchClaimRows(false),
    fetchClaimRows(true),
  ]);

  const totalClaimAmt = claimRows.reduce((s, r) => s + r.claimAmt, 0);
  const lhbRows = claimRows.filter(r => r.payTo === 'LHB');
  const totalLhbAmt = lhbRows.reduce((s, r) => s + r.claimAmt, 0);

  const totalNdAmt = ndRows.reduce((s, r) => s + r.claimAmt, 0);

  const mapRow = (r: ClaimRow, i: number) => ({
    no:              i + 1,
    certNo:          r.certNo,
    membershipNo:    r.membershipNo,
    agreementNo:     r.agreementNo,
    fullName:        r.fullName,
    maturityDate:    fmtDate(r.maturityDate),
    claimAmt:        r.claimAmt,
    docNo:           r.docNo,
    pymtFromTrustee: fmtDate(r.pymtFromTrustee),
    pymtDateToMem:   fmtDate(r.pymtDateToMem),
    claimType:       r.claimType,
    payTo:           r.payTo,
  });

  res.json({
    data: claimRows.map(mapRow),
    nd:   ndRows.map(mapRow),
    meta: {
      total: claimRows.length,
      totalClaimAmt,
      totalLhbAmt,
      lhbCases: lhbRows.length,
      ndTotal: ndRows.length,
      totalNdAmt,
    },
  });
}

// ── Excel ───────────────────────────────────────────────────────────────────

const CLAIM_COLS = [
  { header: 'No',                width: 5  },
  { header: 'Cert No',          width: 12 },
  { header: 'Mem No',           width: 26 },
  { header: 'Agmt No',          width: 10 },
  { header: 'Name',             width: 40 },
  { header: 'Maturity Date',    width: 14 },
  { header: 'Claim Amt',        width: 14 },
  { header: 'Doc No',           width: 24 },
  { header: 'Pymt From Trustee', width: 18 },
  { header: 'Pymt Date To Mem', width: 18 },
  { header: 'Type',             width: 6  },
  { header: 'Pay To',           width: 8  },
] as const;

const ND_COLS = [
  { header: 'No',                width: 5  },
  { header: 'Cert No',          width: 12 },
  { header: 'Mem No',           width: 26 },
  { header: 'Agmt No',          width: 10 },
  { header: 'Name',             width: 40 },
  { header: 'Maturity Date',    width: 14 },
  { header: 'Claim Amt',        width: 14 },
  { header: 'Doc No',           width: 24 },
  { header: 'Pymt From Trustee', width: 18 },
  { header: 'Pymt Date To Mem', width: 18 },
  { header: 'Type',             width: 6  },
] as const;

function fmtRM(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function colLetter(count: number): string {
  return String.fromCharCode(64 + count);
}

function buildSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  subtitle: string,
  dateStr: string,
  cols: ReadonlyArray<{ header: string; width: number }>,
  rows: ClaimRow[],
  includePayTo: boolean,
) {
  const ws = wb.addWorksheet(sheetName);
  const lastCol = colLetter(cols.length);

  ws.columns = cols.map(c => ({ width: c.width }));

  // Row 1: title
  const r1 = ws.addRow([subtitle]);
  ws.mergeCells(`A${r1.number}:${lastCol}${r1.number}`);
  r1.height = 22;
  r1.getCell(1).font      = { bold: true, size: 14, color: { argb: 'FF1B4F72' } };
  r1.getCell(1).alignment = { vertical: 'middle' };

  // Row 2: date line
  const r2 = ws.addRow([`Date: ${dateStr}   |   Total: ${rows.length} claims`]);
  ws.mergeCells(`A${r2.number}:${lastCol}${r2.number}`);
  r2.height = 16;
  r2.getCell(1).font      = { size: 9, color: { argb: 'FF555555' } };
  r2.getCell(1).alignment = { vertical: 'middle' };

  // Row 3: blank
  ws.addRow([]);

  // Row 4: column headers
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

  // Data rows
  const claimAmtCol = 7;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const even = i % 2 === 0;
    const bg: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: even ? 'FFFFFFFF' : 'FFEBF5FB' } };

    const vals: (string | number)[] = [
      i + 1,
      row.certNo,
      row.membershipNo,
      row.agreementNo,
      row.fullName,
      fmtDate(row.maturityDate),
      row.claimAmt,
      row.docNo,
      fmtDate(row.pymtFromTrustee),
      fmtDate(row.pymtDateToMem),
      row.claimType,
    ];
    if (includePayTo) vals.push(row.payTo);

    const dataRow = ws.addRow(vals);
    dataRow.eachCell(cell => {
      cell.fill      = bg;
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });
    dataRow.getCell(claimAmtCol).numFmt = '#,##0.00';
    dataRow.getCell(claimAmtCol).alignment = { vertical: 'middle', horizontal: 'right' };
  }

  // Blank row
  ws.addRow([]);

  // Total row
  const totalClaimAmt = rows.reduce((s, r) => s + r.claimAmt, 0);

  if (includePayTo) {
    const lhbRows = rows.filter(r => r.payTo === 'LHB');
    const totalLhbAmt = lhbRows.reduce((s, r) => s + r.claimAmt, 0);
    const totalRow = ws.addRow([
      '', '', '', '', '', 'Total Claim Paid:', totalClaimAmt,
      '', '', 'Total Paid to LHB:', totalLhbAmt, `(${lhbRows.length} cases)`,
    ]);
    totalRow.getCell(6).font  = { bold: true, size: 10 };
    totalRow.getCell(6).alignment = { vertical: 'middle', horizontal: 'right' };
    totalRow.getCell(7).font  = { bold: true, size: 10 };
    totalRow.getCell(7).numFmt = '#,##0.00';
    totalRow.getCell(7).alignment = { vertical: 'middle', horizontal: 'right' };
    totalRow.getCell(10).font = { bold: true, size: 10 };
    totalRow.getCell(10).alignment = { vertical: 'middle', horizontal: 'right' };
    totalRow.getCell(11).font = { bold: true, size: 10 };
    totalRow.getCell(11).numFmt = '#,##0.00';
    totalRow.getCell(11).alignment = { vertical: 'middle', horizontal: 'right' };
    totalRow.getCell(12).font = { bold: true, size: 10, color: { argb: 'FF555555' } };
  } else {
    const totalRow = ws.addRow([
      '', '', '', '', '', 'Total Claim Paid:', totalClaimAmt,
    ]);
    totalRow.getCell(6).font  = { bold: true, size: 10 };
    totalRow.getCell(6).alignment = { vertical: 'middle', horizontal: 'right' };
    totalRow.getCell(7).font  = { bold: true, size: 10 };
    totalRow.getCell(7).numFmt = '#,##0.00';
    totalRow.getCell(7).alignment = { vertical: 'middle', horizontal: 'right' };
  }
}

export async function generatePbsClaimReport(req: Request, res: Response): Promise<void> {
  const [claimRows, ndRows] = await Promise.all([
    fetchClaimRows(false),
    fetchClaimRows(true),
  ]);

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

  const totalClaimAmt = claimRows.reduce((s, r) => s + r.claimAmt, 0);
  const totalNdAmt    = ndRows.reduce((s, r) => s + r.claimAmt, 0);

  await writeAudit({
    userId: req.user.id,
    action: `Generated PBS Claim Report (Excel): ${claimRows.length} claims (${fmtRM(totalClaimAmt)}), ${ndRows.length} ND claims (${fmtRM(totalNdAmt)})`,
    actionType: 'CREATE',
    targetType: 'PbsClaim',
    metadata: { claimCount: claimRows.length, totalClaimAmt, ndCount: ndRows.length, totalNdAmt },
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="pbs-claim-report-${dateStr}.xlsx"`);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LHB MMS';
  wb.created = now;

  buildSheet(wb, 'PBS Claim Listing', SUBTITLE_CLAIM, dateStr, CLAIM_COLS, claimRows, true);
  buildSheet(wb, 'Natural Death Claim', SUBTITLE_ND, dateStr, ND_COLS, ndRows, false);

  await wb.xlsx.write(res);
}
