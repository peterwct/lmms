import { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import ExcelJS from 'exceljs';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

function parsePagination(query: Record<string, unknown>) {
  const page  = Math.max(1, parseInt(String(query.page  ?? 1), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? 20), 10)));
  return { skip: (page - 1) * limit, take: limit, page, limit };
}

// ── List PBS Schemes ──────────────────────────────────────────────────────────

export async function listPbsSchemes(req: Request, res: Response): Promise<void> {
  const { skip, take, page, limit } = parsePagination(req.query as Record<string, unknown>);
  const { coCode, acctClassify, schemeType, claimIndc, q } = req.query as Record<string, string>;

  const and: object[] = [{ pbsIndc: true }];

  if (coCode) and.push({ coCode });
  if (acctClassify) and.push({ agreement: { acctClassify } });
  if (schemeType) and.push({ schemeType });

  if (claimIndc === 'true')  and.push({ claimIndc: true });
  if (claimIndc === 'false') and.push({ claimIndc: false });

  if (q?.trim()) {
    const term = q.trim();
    // Find agreementNos where ANY agreement (including TF transfer counterparts) matches the search
    const matchingAgmtNos = await prisma.agreement.findMany({
      where: { OR: [
        { membershipNo: { contains: term, mode: 'insensitive' } },
        { member: { fullName: { contains: term, mode: 'insensitive' } } },
      ]},
      select: { agreementNo: true },
      distinct: ['agreementNo'],
    });
    const agmtNos = matchingAgmtNos.map(a => a.agreementNo);

    and.push({ OR: [
      { agreementNo: { contains: term, mode: 'insensitive' } },
      { certNo:      { contains: term, mode: 'insensitive' } },
      { agreement: { membershipNo: { contains: term, mode: 'insensitive' } } },
      { agreement: { member: { fullName: { contains: term, mode: 'insensitive' } } } },
      ...(agmtNos.length ? [{ agreementNo: { in: agmtNos } }] : []),
    ]});
  }

  const where = and.length ? { AND: and } : {};

  const [total, data] = await Promise.all([
    prisma.pbsScheme.count({ where }),
    prisma.pbsScheme.findMany({
      where,
      include: {
        agreement: {
          select: {
            id: true,
            membershipNo: true,
            agreementDate: true,
            acctClassify: true,
            member: { select: { id: true, fullName: true, membershipNo: true } },
          },
        },
      },
      orderBy: { agreementNo: 'asc' },
      skip, take,
    }),
  ]);

  // Resolve TT transfer cases: show TF counterpart's member info
  const ttItems = data.filter(s => s.agreement?.acctClassify === 'TM' && s.agreementNo);
  if (ttItems.length > 0) {
    const tfMap = new Map<string, { membershipNo: string; acctClassify: string; member: { id: string; fullName: string; membershipNo: string } }>();
    const tfAgmts = await prisma.agreement.findMany({
      where: { agreementNo: { in: ttItems.map(s => s.agreementNo) }, transferFlag: 'TF' },
      select: { agreementNo: true, membershipNo: true, acctClassify: true, member: { select: { id: true, fullName: true, membershipNo: true } } },
    });
    for (const a of tfAgmts) tfMap.set(a.agreementNo, a);

    for (const item of data) {
      const tf = tfMap.get(item.agreementNo);
      if (tf && item.agreement) {
        (item as any).agreement.membershipNo = tf.membershipNo;
        (item as any).agreement.acctClassify = tf.acctClassify;
        (item as any).agreement.member = tf.member;
      }
    }
  }

  res.json({ data, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
}

// ── Get Single PBS Scheme ─────────────────────────────────────────────────────

export async function getPbsScheme(req: Request, res: Response): Promise<void> {
  const scheme = await prisma.pbsScheme.findUnique({
    where: { id: req.params.id },
    include: {
      agreement: {
        select: {
          id: true,
          membershipNo: true,
          agreementNo: true,
          agreementDate: true,
          acctClassify: true,
          coCode: true,
          memberId: true,
          member: { select: { id: true, fullName: true, membershipNo: true } },
        },
      },
      claims: { orderBy: { refNo: 'asc' } },
    },
  });

  if (!scheme) { res.status(404).json({ error: 'PBS scheme not found' }); return; }

  // Resolve TT transfer: show TF counterpart's member info and status
  if (scheme.agreement?.acctClassify === 'TM') {
    const tf = await prisma.agreement.findFirst({
      where: { agreementNo: scheme.agreementNo, transferFlag: 'TF' },
      select: { membershipNo: true, acctClassify: true, agreementDate: true, memberId: true, member: { select: { id: true, fullName: true, membershipNo: true } } },
    });
    if (tf) {
      (scheme as any).agreement.membershipNo = tf.membershipNo;
      (scheme as any).agreement.acctClassify = tf.acctClassify;
      (scheme as any).agreement.agreementDate = tf.agreementDate;
      (scheme as any).agreement.memberId = tf.memberId;
      (scheme as any).agreement.member = tf.member;
    }
  }

  res.json({ data: scheme });
}

// ── Update PBS Scheme ─────────────────────────────────────────────────────────

const pbsUpdateSchema = z.object({
  certNo:      z.string().nullish(),
  schemeType:  z.string().nullish(),
  paybackDate: z.string().nullish(),
  topUp:       z.boolean().optional(),
  pbsIndc:     z.boolean().optional(),
  claimIndc:   z.boolean().optional(),
  remark:      z.string().nullish(),
});

export async function updatePbsScheme(req: Request, res: Response): Promise<void> {
  const parsed = pbsUpdateSchema.parse(req.body);

  const data: Record<string, unknown> = { ...parsed, updatedAt: new Date() };
  if (parsed.paybackDate) data.paybackDate = new Date(parsed.paybackDate);
  else if (parsed.paybackDate === null) data.paybackDate = null;

  const updated = await prisma.pbsScheme.update({
    where: { id: req.params.id },
    data,
  });

  await writeAudit({
    userId: req.user!.id,
    action: `Updated PBS scheme ${updated.agreementNo}`,
    actionType: 'UPDATE',
    targetType: 'PbsScheme',
    metadata: parsed as unknown as Prisma.JsonObject,
  });

  res.json({ data: updated });
}

// ── Create Claim ──────────────────────────────────────────────────────────────

const claimCreateSchema = z.object({
  claimant:      z.string().nullish(),
  claimantIc:    z.string().nullish(),
  accNo:         z.string().nullish(),
  bankCode:      z.string().nullish(),
  relationCode:  z.string().nullish(),
  remark:        z.string().nullish(),
  lossDate:      z.string().nullish(),
  claimAmt:      z.number({ required_error: 'Claim amount is required' }),
  payMode:       z.string().nullish(),
  docNo:         z.string().nullish(),
  docDate:       z.string().nullish(),
  claimType:     z.string().nullish(),
  claimRemark:   z.string().nullish(),
  trustPaidDate: z.string().nullish(),
});

export async function createClaim(req: Request, res: Response): Promise<void> {
  const parsed = claimCreateSchema.parse(req.body);
  const pbsSchemeId = req.params.id;

  const scheme = await prisma.pbsScheme.findUnique({
    where: { id: pbsSchemeId },
    select: { agreementNo: true, certNo: true },
  });
  if (!scheme) { res.status(404).json({ error: 'PBS scheme not found' }); return; }

  const maxRef = await prisma.pbsClaim.aggregate({
    where: { pbsSchemeId },
    _max: { refNo: true },
  });
  const refNo = (maxRef._max.refNo ?? 0) + 1;

  const claim = await prisma.pbsClaim.create({
    data: {
      id: randomUUID(),
      pbsSchemeId,
      agreementNo: scheme.agreementNo,
      certNo: scheme.certNo,
      refNo,
      claimant:      parsed.claimant ?? null,
      claimantIc:    parsed.claimantIc ?? null,
      accNo:         parsed.accNo ?? null,
      bankCode:      parsed.bankCode ?? null,
      relationCode:  parsed.relationCode ?? null,
      remark:        parsed.remark ?? null,
      lossDate:      parsed.lossDate ? new Date(parsed.lossDate) : null,
      claimAmt:      parsed.claimAmt,
      payMode:       parsed.payMode ?? null,
      docNo:         parsed.docNo ?? null,
      docDate:       parsed.docDate ? new Date(parsed.docDate) : null,
      claimType:     parsed.claimType ?? null,
      claimRemark:   parsed.claimRemark ?? null,
      trustPaidDate: parsed.trustPaidDate ? new Date(parsed.trustPaidDate) : null,
      updatedAt:     new Date(),
    },
  });

  if (parsed.claimType && ['AD', 'TPD', 'PBS'].includes(parsed.claimType)) {
    await prisma.pbsScheme.update({
      where: { id: pbsSchemeId },
      data: { claimIndc: true, updatedAt: new Date() },
    });
  }

  await writeAudit({
    userId: req.user!.id,
    action: `Created PBS claim #${refNo} for agreement ${scheme.agreementNo}`,
    actionType: 'CREATE',
    targetType: 'PbsClaim',
    metadata: { refNo, agreementNo: scheme.agreementNo, claimType: parsed.claimType },
  });

  res.status(201).json({ data: claim });
}

// ── Auto Transfer to Claim ────────────────────────────────────────────────────

const autoTransferSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year:  z.coerce.number().int().min(1900).max(2200),
});

interface AutoTransferMatch {
  pbs_id: string;
  co_code: string;
  agreement_no: string;
  cert_no: string | null;
  scheme_type: string | null;
  payback_date: Date | null;
  membership_no: string;
  full_name: string;
  acct_classify: string;
}

// PBS-type claim amount is fixed by scheme type (mirrors the frontend AD/TPD/PBS rule).
function pbsClaimAmount(schemeType: string | null): number {
  return schemeType === '19K' ? 19000 : schemeType === '21K' ? 21000 : 0;
}

// Schemes due to pay back in the given month/year, that are in PBS and not yet claimed.
// Joins Agreement by natural key (coCode + agreementNo) and drops the transferred-out
// duplicate (transferFlag = 'TT') because the PbsScheme.agreementId FK is unreliable
// for transferred agreements — see pbs-variance.report.ts / CLAUDE.md.
async function findAutoTransferMatches(month: number, year: number): Promise<AutoTransferMatch[]> {
  return prisma.$queryRaw<AutoTransferMatch[]>`
    SELECT p."id"           AS pbs_id,
           p."coCode"       AS co_code,
           p."agreementNo"  AS agreement_no,
           p."certNo"       AS cert_no,
           p."schemeType"   AS scheme_type,
           p."paybackDate"  AS payback_date,
           m."membershipNo" AS membership_no,
           m."fullName"     AS full_name,
           a."acctClassify" AS acct_classify
    FROM "PbsScheme" p
    JOIN "Agreement" a
      ON a."coCode" = p."coCode" AND a."agreementNo" = p."agreementNo"
     AND a."transferFlag" IS DISTINCT FROM 'TT'
    JOIN "Member" m ON m."id" = a."memberId"
    WHERE p."pbsIndc" = true
      AND p."claimIndc" = false
      AND p."paybackDate" IS NOT NULL
      AND EXTRACT(MONTH FROM p."paybackDate") = ${month}
      AND EXTRACT(YEAR  FROM p."paybackDate") = ${year}
    ORDER BY m."membershipNo", p."agreementNo"
  `;
}

export async function previewAutoTransfer(req: Request, res: Response): Promise<void> {
  const { month, year } = autoTransferSchema.parse(req.query);
  const matches = await findAutoTransferMatches(month, year);
  const rows = matches.map(r => ({
    pbsId:        r.pbs_id,
    coCode:       r.co_code,
    membershipNo: r.membership_no,
    fullName:     r.full_name,
    agreementNo:  r.agreement_no,
    certNo:       r.cert_no,
    schemeType:   r.scheme_type,
    paybackDate:  r.payback_date,
    acctClassify: r.acct_classify,
    claimAmt:     pbsClaimAmount(r.scheme_type),
  }));
  res.json({ data: rows, meta: { total: rows.length } });
}

export async function runAutoTransfer(req: Request, res: Response): Promise<void> {
  const { month, year } = autoTransferSchema.parse(req.body);

  // May only run for the current or next month; back-dated runs are unrestricted.
  const now = new Date();
  const periodIndex  = year * 12 + (month - 1);
  const currentIndex = now.getFullYear() * 12 + now.getMonth();
  if (periodIndex > currentIndex + 1) {
    res.status(400).json({ error: 'Auto Transfer can only be run for the current or next month.' });
    return;
  }

  const matches = await findAutoTransferMatches(month, year);

  const claimIds: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const m of matches) {
      const maxRef = await tx.pbsClaim.aggregate({
        where: { pbsSchemeId: m.pbs_id },
        _max: { refNo: true },
      });
      const refNo = (maxRef._max.refNo ?? 0) + 1;

      const claimId = randomUUID();
      await tx.pbsClaim.create({
        data: {
          id: claimId,
          pbsSchemeId: m.pbs_id,
          agreementNo: m.agreement_no,
          certNo:      m.cert_no,
          refNo,
          claimType:   'PBS',
          claimRemark: 'Group Payback Scheme Rider',
          claimAmt:    pbsClaimAmount(m.scheme_type),
          updatedAt:   new Date(),
        },
      });
      claimIds.push(claimId);

      await tx.pbsScheme.update({
        where: { id: m.pbs_id },
        data: { claimIndc: true, updatedAt: new Date() },
      });
    }
  }, { timeout: 120000, maxWait: 10000 });

  const count = matches.length;
  const mmYyyy = `${String(month).padStart(2, '0')}/${year}`;

  if (count > 0) {
    await writeAudit({
      userId: req.user!.id,
      action: `Auto-transferred ${count} PBS scheme(s) to claims for ${mmYyyy}`,
      actionType: 'CREATE',
      targetType: 'PbsClaim',
      metadata: { month, year, count, agreementNos: matches.map(m => m.agreement_no) },
    });
  }

  res.json({ data: { count, month, year, claimIds } });
}

function fmtDdMmYyyy(d: Date | null): string {
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

interface AutoTransferExportRow {
  membership_no: string;
  full_name: string;
  agreement_no: string;
  cert_no: string | null;
  scheme_type: string | null;
  payback_date: Date | null;
  acct_classify: string;
  claim_amt: number;
}

const autoTransferExportSchema = z.object({
  month:    z.coerce.number().int().min(1).max(12),
  year:     z.coerce.number().int().min(1900).max(2200),
  claimIds: z.array(z.string()).default([]),
});

// Excel of the exact PBS claims a run created (identified by claimIds so a manually
// keyed-in PBS claim for the same period is never swept in).
export async function exportAutoTransfer(req: Request, res: Response): Promise<void> {
  const { month, year, claimIds } = autoTransferExportSchema.parse(req.body);

  const rows = claimIds.length === 0 ? [] : await prisma.$queryRaw<AutoTransferExportRow[]>`
    SELECT m."membershipNo"    AS membership_no,
           m."fullName"        AS full_name,
           p."agreementNo"     AS agreement_no,
           p."certNo"          AS cert_no,
           p."schemeType"      AS scheme_type,
           p."paybackDate"     AS payback_date,
           a."acctClassify"    AS acct_classify,
           c."claimAmt"::float AS claim_amt
    FROM "PbsClaim" c
    JOIN "PbsScheme" p ON p."id" = c."pbsSchemeId"
    JOIN "Agreement" a
      ON a."coCode" = p."coCode" AND a."agreementNo" = p."agreementNo"
     AND a."transferFlag" IS DISTINCT FROM 'TT'
    JOIN "Member" m ON m."id" = a."memberId"
    WHERE c."id" IN (${Prisma.join(claimIds)})
    ORDER BY m."membershipNo", p."agreementNo"
  `;

  const now = new Date();
  const mm = String(month).padStart(2, '0');
  const dateStr = fmtDdMmYyyy(now);
  const totalAmt = rows.reduce((s, r) => s + Number(r.claim_amt), 0);

  const cols = [
    { header: 'No',            width: 5  },
    { header: 'Membership No', width: 26 },
    { header: 'Name',          width: 40 },
    { header: 'Agreement No',  width: 12 },
    { header: 'Cert No',       width: 12 },
    { header: 'Scheme',        width: 8  },
    { header: 'Payback Date',  width: 14 },
    { header: 'Status',        width: 8  },
    { header: 'Claim Amount',  width: 14 },
  ];
  const amtCol  = cols.length;
  const lastCol = String.fromCharCode(64 + cols.length);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LHB MMS';
  wb.created = now;
  const ws = wb.addWorksheet('Auto Transfer');
  ws.columns = cols.map(c => ({ width: c.width }));

  const r1 = ws.addRow(['Zurich PBS Auto Transfer to Claim']);
  ws.mergeCells(`A${r1.number}:${lastCol}${r1.number}`);
  r1.height = 22;
  r1.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF1B4F72' } };
  r1.getCell(1).alignment = { vertical: 'middle' };

  const r2 = ws.addRow([`Payback Period: ${mm}/${year}   |   Generated: ${dateStr}   |   Total: ${rows.length} claim(s)`]);
  ws.mergeCells(`A${r2.number}:${lastCol}${r2.number}`);
  r2.height = 16;
  r2.getCell(1).font = { size: 9, color: { argb: 'FF555555' } };
  r2.getCell(1).alignment = { vertical: 'middle' };

  ws.addRow([]);

  const hdrRow = ws.addRow(cols.map(c => c.header));
  hdrRow.height = 20;
  hdrRow.eachCell(cell => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4F72' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border    = { bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } };
  });
  ws.views      = [{ state: 'frozen', ySplit: hdrRow.number }];
  ws.autoFilter = { from: { row: hdrRow.number, column: 1 }, to: { row: hdrRow.number, column: cols.length } };

  rows.forEach((r, i) => {
    const even = i % 2 === 0;
    const dataRow = ws.addRow([
      i + 1,
      r.membership_no,
      r.full_name,
      r.agreement_no,
      r.cert_no ?? '',
      r.scheme_type ?? '',
      fmtDdMmYyyy(r.payback_date),
      r.acct_classify,
      Number(r.claim_amt),
    ]);
    dataRow.eachCell(cell => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: even ? 'FFFFFFFF' : 'FFEBF5FB' } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });
    dataRow.getCell(amtCol).numFmt    = '#,##0.00';
    dataRow.getCell(amtCol).alignment = { vertical: 'middle', horizontal: 'right' };
  });

  ws.addRow([]);
  const totalRow = ws.addRow(cols.map((_, i) => (i === amtCol - 2 ? 'Total:' : i === amtCol - 1 ? totalAmt : '')));
  totalRow.getCell(amtCol - 1).font      = { bold: true, size: 10 };
  totalRow.getCell(amtCol - 1).alignment = { vertical: 'middle', horizontal: 'right' };
  totalRow.getCell(amtCol).font      = { bold: true, size: 10 };
  totalRow.getCell(amtCol).numFmt    = '#,##0.00';
  totalRow.getCell(amtCol).alignment = { vertical: 'middle', horizontal: 'right' };

  await writeAudit({
    userId: req.user!.id,
    action: `Exported PBS Auto Transfer list for ${mm}/${year}: ${rows.length} claim(s)`,
    actionType: 'CREATE',
    targetType: 'PbsClaim',
    metadata: { month, year, count: rows.length },
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="pbs-auto-transfer-${year}${mm}.xlsx"`);
  await wb.xlsx.write(res);
}

// ── Update Claim ──────────────────────────────────────────────────────────────

const claimUpdateSchema = claimCreateSchema;

export async function updateClaim(req: Request, res: Response): Promise<void> {
  const parsed = claimUpdateSchema.parse(req.body);
  const { claimId } = req.params;

  const data: Record<string, unknown> = {
    ...parsed,
    updatedAt: new Date(),
  };
  if (parsed.lossDate) data.lossDate = new Date(parsed.lossDate);
  else if (parsed.lossDate === null) data.lossDate = null;
  if (parsed.docDate) data.docDate = new Date(parsed.docDate);
  else if (parsed.docDate === null) data.docDate = null;
  if (parsed.trustPaidDate) data.trustPaidDate = new Date(parsed.trustPaidDate);
  else if (parsed.trustPaidDate === null) data.trustPaidDate = null;

  const updated = await prisma.pbsClaim.update({
    where: { id: claimId },
    data,
  });

  await writeAudit({
    userId: req.user!.id,
    action: `Updated PBS claim #${updated.refNo} for agreement ${updated.agreementNo}`,
    actionType: 'UPDATE',
    targetType: 'PbsClaim',
    metadata: parsed as unknown as Prisma.JsonObject,
  });

  res.json({ data: updated });
}

// ── Delete Claim ──────────────────────────────────────────────────────────────

export async function deleteClaim(req: Request, res: Response): Promise<void> {
  const { claimId } = req.params;

  const claim = await prisma.pbsClaim.findUnique({ where: { id: claimId } });
  if (!claim) { res.status(404).json({ error: 'Claim not found' }); return; }

  await prisma.pbsClaim.delete({ where: { id: claimId } });

  if (claim.claimType && ['AD', 'TPD', 'PBS'].includes(claim.claimType)) {
    await prisma.pbsScheme.update({
      where: { id: claim.pbsSchemeId },
      data: { claimIndc: false, updatedAt: new Date() },
    });
  }

  await writeAudit({
    userId: req.user!.id,
    action: `Deleted PBS claim #${claim.refNo} for agreement ${claim.agreementNo}`,
    actionType: 'DELETE',
    targetType: 'PbsClaim',
    metadata: { refNo: claim.refNo, agreementNo: claim.agreementNo, claimType: claim.claimType },
  });

  res.json({ message: 'Claim deleted' });
}
