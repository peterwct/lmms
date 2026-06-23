import { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
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
