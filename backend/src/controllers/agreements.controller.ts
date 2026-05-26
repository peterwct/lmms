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
    membershipNo, agreementNo, name, icNew,
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
    : { agreementDate: 'desc' };

  const [total, agreements] = await Promise.all([
    prisma.agreement.count({ where }),
    prisma.agreement.findMany({
      where,
      include: {
        member:      { select: { id: true, membershipNo: true, fullName: true, icNew: true } },
        amcSchedule: { select: { id: true, nextDueDate: true, billingStatus: true, invoicesIssued: true, totalInvoices: true } },
        pbsScheme:   { select: { certNo: true, schemeType: true, paybackDate: true, topUp: true, pbsIndc: true, claimIndc: true } },
      },
      orderBy,
      skip, take,
    }),
  ]);
  res.json({ data: agreements, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
}

export async function getAgreement(req: Request, res: Response): Promise<void> {
  const agreement = await prisma.agreement.findUnique({
    where: { id: req.params.id },
    include: {
      member:      true,
      nominees:    { orderBy: { nomineeSeq: 'asc' } },
      amcSchedule:         true,
      amcInvoices:         { orderBy: [{ invoiceYearSeq: 'asc' }, { invComponent: 'asc' }] },
      pbsScheme:           true,
      cancellationReason:  true,
    },
  });
  if (!agreement) { res.status(404).json({ error: 'Agreement not found' }); return; }
  res.json({ data: agreement });
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

export async function changeAgreementStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const { acctClassify } = z.object({ acctClassify: z.enum(['NA', 'SU', 'PT', 'TM']) }).parse(req.body);

  const agreement = await prisma.agreement.findUnique({ where: { id }, include: { amcSchedule: true } });
  if (!agreement) { res.status(404).json({ error: 'Agreement not found' }); return; }

  await prisma.$transaction(async (tx) => {
    await tx.agreement.update({ where: { id }, data: { acctClassify, updatedAt: new Date() } });
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
        metadata: { agreementId: id, oldStatus: agreement.acctClassify, newStatus: acctClassify },
      },
    });
  });
  res.json({ message: 'Agreement status updated' });
}
