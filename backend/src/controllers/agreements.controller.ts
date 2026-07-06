import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

const agreementUpdateSchema = z.object({
  agreementDate:    z.string().datetime().optional(),
  endDate:          z.string().datetime().optional().nullable(),
  termYears:        z.number().int().optional(),
  agreementType:    z.string().optional(),
  totalPoints:      z.number().int().optional().nullable(),
  purchasePrice:    z.number().optional().nullable(),
  downPayment:      z.number().optional().nullable(),
  subFees:          z.number().optional().nullable(),
  loanAmount:       z.number().optional().nullable(),
  loanType:         z.string().optional().nullable(),
  salesBranch:      z.string().optional(),
  salesMonth:       z.string().optional(),
  salesSource:      z.string().optional(),
  certificateNo:    z.string().optional(),
  rciRefNo:         z.string().optional().nullable(),
  rciNominee:       z.string().optional().nullable(),
  rciEnrolDate:     z.string().datetime().optional().nullable(),
  rciExpiryDate:    z.string().datetime().optional().nullable(),
  rciFeePaid:       z.number().optional().nullable(),
  outstdDoc:        z.boolean().optional(),
  docDescription:   z.string().optional().nullable(),
  canCode:          z.string().optional().nullable(),
});

function parsePagination(query: Record<string, unknown>) {
  const page  = Math.max(1, parseInt(String(query.page  ?? 1), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? 20), 10)));
  return { skip: (page - 1) * limit, take: limit, page, limit };
}

const SORT_FIELDS: Record<string, object> = {
  coCode:        { coCode: 'asc' },
  membershipNo:  { membershipNo: 'asc' },
  agreementNo:   { agreementNo: 'asc' },
  agreementDate: { agreementDate: 'asc' },
  acctClassify:  { acctClassify: 'asc' },
  fullName:      { member: { fullName: 'asc' } },
  icNew:         { member: { icNew: 'asc' } },
};

export async function listAgreements(req: Request, res: Response): Promise<void> {
  const { skip, take, page, limit } = parsePagination(req.query as Record<string, unknown>);
  const {
    memberId, coCode, acctClassify, branchCode, q,
    membershipNo, agreementNo, name, icNew, icOld, jaName, spouseName, nomineeName,
    sortBy, sortDir,
  } = req.query as Record<string, string>;

  const and: object[] = [];

  if (memberId)     and.push({ memberId });
  if (coCode)       and.push({ coCode });
  if (acctClassify) and.push({ acctClassify });
  if (branchCode)   and.push({ salesBranch: branchCode });

  // Combined search (Agreements list page)
  if (q?.trim()) {
    and.push({ OR: [
      { agreementNo:  { contains: q.trim(), mode: 'insensitive' } },
      { membershipNo: { contains: q.trim(), mode: 'insensitive' } },
      { member: { fullName: { contains: q.trim(), mode: 'insensitive' } } },
    ]});
  }

  // Individual field search (Member Enquiry page)
  if (membershipNo?.trim()) and.push({ membershipNo: { contains: membershipNo.trim(), mode: 'insensitive' } });
  if (agreementNo?.trim())  and.push({ agreementNo:  { contains: agreementNo.trim(),  mode: 'insensitive' } });
  if (name?.trim())         and.push({ member: { fullName: { contains: name.trim(), mode: 'insensitive' } } });
  if (icNew?.trim())        and.push({ member: { icNew:    { contains: icNew.trim(), mode: 'insensitive' } } });
  if (icOld?.trim())        and.push({ member: { icOld:    { contains: icOld.trim(), mode: 'insensitive' } } });
  if (jaName?.trim())       and.push({ member: { jaName:   { contains: jaName.trim(), mode: 'insensitive' } } });
  if (spouseName?.trim())   and.push({ member: { spouseName: { contains: spouseName.trim(), mode: 'insensitive' } } });
  if (nomineeName?.trim())  and.push({ nominees: { some: { fullName: { contains: nomineeName.trim(), mode: 'insensitive' } } } });

  const where = and.length ? { AND: and } : {};

  // Sort
  const dir  = sortDir === 'desc' ? 'desc' : 'asc';
  const base = SORT_FIELDS[sortBy ?? ''];
  // When sorting by status, add member name as secondary sort so Active+Name
  // ordering works as expected on the Member Enquiry page.
  const orderBy: object | object[] = base
    ? sortBy === 'acctClassify'
      ? [{ acctClassify: dir }, { member: { fullName: 'asc' } }]
      : JSON.parse(JSON.stringify(base).replace(/"asc"/, `"${dir}"`))
    : [{ acctClassify: 'asc' }, { agreementDate: 'asc' }];

  const [total, agreements] = await Promise.all([
    prisma.agreement.count({ where }),
    prisma.agreement.findMany({
      where,
      include: {
        member: { select: { id: true, membershipNo: true, fullName: true, icNew: true, jaName: true, spouseName: true } },
      },
      orderBy,
      skip, take,
    }),
  ]);

  // Resolve AMC + PBS by natural key instead of FK to handle transferred agreements
  const enriched = await Promise.all(agreements.map(async (a) => {
    const [amcSchedule, pbsScheme] = await Promise.all([
      prisma.amcSchedule.findFirst({
        where: { coCode: a.coCode, agreementNo: a.agreementNo, membershipNo: a.membershipNo },
        select: { id: true, nextDueDate: true, billingStatus: true, invoicesIssued: true, totalInvoices: true },
      }),
      prisma.pbsScheme.findFirst({
        where: { coCode: a.coCode, agreementNo: a.agreementNo },
        select: { certNo: true, schemeType: true, paybackDate: true, topUp: true, pbsIndc: true, claimIndc: true },
      }),
    ]);
    return { ...a, amcSchedule, pbsScheme };
  }));

  res.json({ data: enriched, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
}

export async function getAgreement(req: Request, res: Response): Promise<void> {
  const agreement = await prisma.agreement.findUnique({
    where: { id: req.params.id },
    include: {
      member:             true,
      nominees:           { orderBy: { nomineeSeq: 'asc' } },
      amcInvoices:        { orderBy: [{ invoiceYearSeq: 'asc' }, { invComponent: 'asc' }] },
      cancellationReason: true,
      suReason:           true,
    },
  });
  if (!agreement) { res.status(404).json({ error: 'Agreement not found' }); return; }
  // Match AMC schedule and PBS by coCode + agreementNo (not the FK) so that
  // agreements sharing the same agreementNo both resolve to the correct records.
  const [amcSchedule, pbsScheme] = await Promise.all([
    prisma.amcSchedule.findFirst({
      where: { coCode: agreement.coCode, agreementNo: agreement.agreementNo },
    }),
    prisma.pbsScheme.findFirst({
      where: { coCode: agreement.coCode, agreementNo: agreement.agreementNo },
    }),
  ]);

  // Entitlement Balance (LHC 03/15 only): remaining un-utilized nights per year.
  // Each year within the term is entitled to 7 nights (of which <=1 may be a weekend
  // night). Usage is stored in BookingEntitlement, matched by natural key (coCode +
  // membershipNo + agreementNo). Displayed as a 7-year window anchored to the current
  // calendar year: Acc = year-1, Curr = year, Ad1..Ad5 = year+1..+5. Years past the
  // agreement's expiry show 0.
  let entitlementBalance:
    | { label: string; year: number; nights: number; weekend: number }[]
    | null = null;
  if (agreement.coCode === '03' || agreement.coCode === '15') {
    const usage = await prisma.bookingEntitlement.findMany({
      where: {
        coCode: agreement.coCode,
        membershipNo: agreement.membershipNo,
        agreementNo: agreement.agreementNo,
      },
      select: { yearSeq: true, nightsUsed: true, weekendUsed: true },
    });
    const usedBySeq = new Map(usage.map(u => [u.yearSeq, u]));
    const startYear = agreement.agreementDate.getFullYear();
    const expiryYear = agreement.endDate
      ? agreement.endDate.getFullYear()
      : startYear + agreement.termYears;
    const nowYear = new Date().getFullYear();
    const labels = ['Acc', 'Curr', 'Ad1', 'Ad2', 'Ad3', 'Ad4', 'Ad5'];
    entitlementBalance = labels.map((label, i) => {
      const year = nowYear - 1 + i; // Acc = nowYear-1 ... Ad5 = nowYear+5
      const inTerm = year >= startYear && year <= expiryYear;
      const u = usedBySeq.get(year - startYear + 1);
      return {
        label,
        year,
        nights: inTerm ? Math.max(0, 7 - (u?.nightsUsed ?? 0)) : 0,
        weekend: inTerm ? Math.max(0, 1 - (u?.weekendUsed ?? 0)) : 0,
      };
    });
  }

  let salespersonName: string | null = null;
  if (agreement.salespersonCode) {
    const sp = await prisma.salesperson.findUnique({ where: { code: agreement.salespersonCode }, select: { name: true } });
    salespersonName = sp?.name ?? null;
  }

  let transferToMemberName: string | null = null;
  let transferFromMemberName: string | null = null;
  let transferToMemberId: string | null = null;
  let transferFromMemberId: string | null = null;
  if (agreement.transferToMembership) {
    const m = await prisma.member.findFirst({ where: { membershipNo: agreement.transferToMembership }, select: { id: true, fullName: true } });
    transferToMemberName = m?.fullName ?? null;
    transferToMemberId = m?.id ?? null;
  }
  if (agreement.transferFromMembership) {
    const m = await prisma.member.findFirst({ where: { membershipNo: agreement.transferFromMembership }, select: { id: true, fullName: true } });
    transferFromMemberName = m?.fullName ?? null;
    transferFromMemberId = m?.id ?? null;
  }

  res.json({ data: { ...agreement, amcSchedule: amcSchedule ?? null, pbsScheme: pbsScheme ?? null, entitlementBalance, salespersonName, transferToMemberName, transferFromMemberName, transferToMemberId, transferFromMemberId } });
}

export async function updateAgreement(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const parsed = agreementUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const data = {
    ...parsed.data,
    agreementDate: parsed.data.agreementDate ? new Date(parsed.data.agreementDate) : undefined,
    endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
    rciEnrolDate: parsed.data.rciEnrolDate ? new Date(parsed.data.rciEnrolDate) : undefined,
    rciExpiryDate: parsed.data.rciExpiryDate ? new Date(parsed.data.rciExpiryDate) : undefined,
  };

  try {
    const agreement = await prisma.agreement.update({ where: { id }, data: { ...data, updatedAt: new Date() } });
    await writeAudit({ userId: req.user.id, action: `Updated agreement: ${agreement.agreementNo}`, actionType: 'UPDATE', targetType: 'Agreement', metadata: { agreementId: id } });
    res.json({ data: agreement });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'Agreement not found' }); }
    else { throw e; }
  }
}

const changeStatusSchema = z.object({
  acctClassify: z.enum(['NA', 'SU', 'PT', 'TM']),
  reasonCode:   z.string().trim().min(1).optional().nullable(),
});

// Department-based authority for a status change. IT (isLocked) and Finance may set
// any status in any direction. Credit may set NA/SU/PT but never TM, and may not touch
// a record whose current status is already TM (i.e. cannot reverse a termination).
// Everyone else (incl. Member Services) has no status-change authority.
function statusChangeAllowed(
  dept: { name: string; isLocked: boolean },
  currentStatus: string,
  newStatus: string,
): boolean {
  if (dept.isLocked) return true;
  if (dept.name === 'Finance') return true;
  if (dept.name === 'Credit') {
    if (newStatus === 'TM') return false;
    if (currentStatus === 'TM') return false;
    return true;
  }
  return false;
}

export async function changeAgreementStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const { acctClassify, reasonCode } = changeStatusSchema.parse(req.body);

  if (acctClassify !== 'NA' && !reasonCode) {
    res.status(400).json({ error: 'A reason code is required when changing status to SU, PT, or TM' });
    return;
  }

  const agreement = await prisma.agreement.findUnique({ where: { id }, include: { amcSchedule: true } });
  if (!agreement) { res.status(404).json({ error: 'Agreement not found' }); return; }

  if (!statusChangeAllowed(req.user.department, agreement.acctClassify, acctClassify)) {
    res.status(403).json({ error: 'Not authorized to set this status' });
    return;
  }

  // Reason code always lives on the field matching the new status; the other
  // field is cleared so a stale reason from a prior status can't resurface later.
  const reasonData =
    acctClassify === 'SU'                              ? { suCode: reasonCode!, canCode: null }
    : (acctClassify === 'PT' || acctClassify === 'TM')  ? { canCode: reasonCode!, suCode: null }
    : { canCode: null, suCode: null };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.agreement.update({
        where: { id },
        data: {
          acctClassify,
          ...reasonData,
          statusChangeDate: acctClassify === 'NA' ? null : new Date(),
          statusChangeUser: acctClassify === 'NA' ? null : req.user!.username,
          updatedAt: new Date(),
        },
      });
      // Stop billing if suspended or pending termination
      if (agreement.amcSchedule && (acctClassify === 'SU' || acctClassify === 'PT' || acctClassify === 'TM')) {
        await tx.amcSchedule.update({ where: { id: agreement.amcSchedule.id }, data: { billingStatus: 'C', updatedAt: new Date() } });
      }
      // Reopen billing on reactivation
      if (agreement.amcSchedule && acctClassify === 'NA') {
        await tx.amcSchedule.update({ where: { id: agreement.amcSchedule.id }, data: { billingStatus: 'N', updatedAt: new Date() } });
      }
      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: `Changed agreement ${agreement.agreementNo} status to ${acctClassify}`,
          actionType: 'UPDATE',
          targetType: 'Agreement',
          metadata: { agreementId: id, oldStatus: agreement.acctClassify, newStatus: acctClassify, reasonCode: reasonCode ?? null },
        },
      });
    });
    res.json({ message: 'Agreement status updated' });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2003') { res.status(400).json({ error: 'Invalid reason code' }); return; }
    throw e;
  }
}
