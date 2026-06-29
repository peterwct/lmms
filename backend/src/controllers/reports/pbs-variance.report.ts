import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../../utils/prisma';
import { writeAudit } from '../../utils/audit';

interface VarianceRow {
  coCode: string;
  membershipNo: string;
  fullName: string;
  agreementNo: string;
  agreementDate: string;
  paybackDate: string;
  acctClassify: string;
  rightfulScheme: string;
  zurichScheme: string;
}

const CUTOFF_19K = new Date('1997-07-02T00:00:00.000Z').getTime();
const CUTOFF_21K = new Date('2012-07-12T00:00:00.000Z').getTime();

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function computeRightful(agmtDate: Date): string {
  const t = agmtDate.getTime();
  if (t <= CUTOFF_19K) return '19K';
  if (t <= CUTOFF_21K) return '21K';
  return 'ERROR';
}

function computePayback(agmtDate: Date): Date {
  const d = new Date(agmtDate);
  d.setFullYear(d.getFullYear() + 33);
  d.setDate(d.getDate() - 1);
  return d;
}

async function buildRows(): Promise<VarianceRow[]> {
  const raw: Array<{
    co_code: string;
    membership_no: string;
    full_name: string;
    agreement_no: string;
    agreement_date: Date;
    acct_classify: string;
    scheme_type: string | null;
    payback_date: Date | null;
    pbs_indc: boolean | null;
  }> = await prisma.$queryRaw`
    SELECT
      a."coCode"        AS co_code,
      m."membershipNo"  AS membership_no,
      m."fullName"      AS full_name,
      a."agreementNo"   AS agreement_no,
      a."agreementDate" AS agreement_date,
      a."acctClassify"  AS acct_classify,
      p."schemeType"    AS scheme_type,
      p."paybackDate"   AS payback_date,
      p."pbsIndc"       AS pbs_indc
    FROM "Agreement" a
    JOIN "Member" m ON m."id" = a."memberId"
    LEFT JOIN "PbsScheme" p
      ON p."coCode" = a."coCode"
      AND p."agreementNo" = a."agreementNo"
    WHERE a."transferFlag" IS DISTINCT FROM 'TT'
      AND SUBSTRING(m."membershipNo" FROM 7 FOR 2) != 'MJ'
      AND (
        (a."coCode" IN ('03', '15')
         AND a."agreementDate" >= '1994-09-27'
         AND a."agreementDate" <= '2012-07-12')
        OR
        (a."coCode" = '03'
         AND p."topUp" = true
         AND p."pbsIndc" = true)
      )
    ORDER BY a."agreementDate"
  `;

  const rows: VarianceRow[] = [];

  for (const r of raw) {
    const zurichScheme = r.pbs_indc === true ? (r.scheme_type ?? 'None') : 'None';

    if (zurichScheme === 'None' && r.acct_classify === 'TM') continue;

    const agmtDate = new Date(r.agreement_date);
    const payback = r.payback_date ? new Date(r.payback_date) : computePayback(agmtDate);

    rows.push({
      coCode: r.co_code,
      membershipNo: r.membership_no,
      fullName: r.full_name,
      agreementNo: r.agreement_no,
      agreementDate: fmtDate(agmtDate),
      paybackDate: fmtDate(payback),
      acctClassify: r.acct_classify,
      rightfulScheme: computeRightful(agmtDate),
      zurichScheme,
    });
  }

  return rows;
}

// ── Preview ──────────────────────────────────────────────────────────────────

export async function previewPbsVariance(req: Request, res: Response): Promise<void> {
  const rows = await buildRows();
  res.json({ data: rows, meta: { total: rows.length } });
}

// ── Generate Excel ───────────────────────────────────────────────────────────

const HDR_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
const HDR_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };

const COLS = [
  { header: 'Co Code',         width: 8 },
  { header: 'Mem No',          width: 26 },
  { header: 'Name',            width: 35 },
  { header: 'Agmt No',         width: 10 },
  { header: 'Agmt Date',       width: 14 },
  { header: 'Payback Date',    width: 14 },
  { header: 'Acct Class',      width: 10 },
  { header: 'Rightful Scheme', width: 15 },
  { header: 'Zurich Scheme',   width: 15 },
];

export async function generatePbsVariance(req: Request, res: Response): Promise<void> {
  const rows = await buildRows();

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

  await writeAudit({
    userId: req.user!.id,
    action: `Generated PBS Variance Report (Excel): ${rows.length} records`,
    actionType: 'CREATE',
    targetType: 'Agreement',
    metadata: { count: rows.length } as any,
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LHB MMS';
  wb.created = now;

  const ws = wb.addWorksheet('PBS Variant Report');
  ws.columns = COLS.map(c => ({ width: c.width }));

  // Title row
  const r1 = ws.addRow(['Zurich PBS Variance Report']);
  ws.mergeCells(`A${r1.number}:I${r1.number}`);
  r1.height = 22;
  r1.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF1B4F72' } };
  r1.getCell(1).alignment = { vertical: 'middle' };

  // Date/meta row
  const r2 = ws.addRow([`Date: ${dateStr}   |   Total: ${rows.length} records`]);
  ws.mergeCells(`A${r2.number}:I${r2.number}`);
  r2.height = 16;
  r2.getCell(1).font = { size: 9, color: { argb: 'FF555555' } };
  r2.getCell(1).alignment = { vertical: 'middle' };

  // Blank row
  ws.addRow([]);

  // Header row
  const hdrRow = ws.addRow(COLS.map(c => c.header));
  hdrRow.height = 20;
  hdrRow.eachCell(cell => {
    cell.font = HDR_FONT;
    cell.fill = HDR_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } };
  });
  ws.views = [{ state: 'frozen', ySplit: hdrRow.number }];
  ws.autoFilter = { from: { row: hdrRow.number, column: 1 }, to: { row: hdrRow.number, column: COLS.length } };

  // Data rows
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const even = i % 2 === 0;
    const bg: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: even ? 'FFFFFFFF' : 'FFEBF5FB' } };

    const dataRow = ws.addRow([
      r.coCode, r.membershipNo, r.fullName, r.agreementNo,
      r.agreementDate, r.paybackDate, r.acctClassify,
      r.rightfulScheme, r.zurichScheme,
    ]);
    dataRow.eachCell(cell => {
      cell.fill = bg;
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });
  }

  // Blank + total
  ws.addRow([]);
  const totalRow = ws.addRow([`Total: ${rows.length} records`]);
  totalRow.getCell(1).font = { bold: true, size: 10 };
  totalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="pbs-variance-report-${dateStr}.xlsx"`);
  await wb.xlsx.write(res);
}
