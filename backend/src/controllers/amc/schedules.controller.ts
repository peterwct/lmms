import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';

function parsePagination(query: Record<string, unknown>) {
  const page  = Math.max(1, parseInt(String(query.page  ?? 1), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? 20), 10)));
  return { skip: (page - 1) * limit, take: limit, page, limit };
}

export async function listSchedules(req: Request, res: Response): Promise<void> {
  const { skip, take, page, limit } = parsePagination(req.query as Record<string, unknown>);
  const { coCode, billingStatus, dueBefore, dueAfter, q, acctClassify } = req.query as Record<string, string>;

  const and: object[] = [];
  if (coCode)        and.push({ coCode });
  if (billingStatus) and.push({ billingStatus });
  if (acctClassify)  and.push({ agreement: { acctClassify } });
  if (dueBefore || dueAfter) {
    and.push({ nextDueDate: {
      ...(dueAfter  ? { gte: new Date(dueAfter)  } : {}),
      ...(dueBefore ? { lte: new Date(dueBefore) } : {}),
    }});
  }
  if (q?.trim()) {
    and.push({ OR: [
      { agreementNo:  { contains: q.trim(), mode: 'insensitive' } },
      { membershipNo: { contains: q.trim(), mode: 'insensitive' } },
      { agreement: { member: { fullName: { contains: q.trim(), mode: 'insensitive' } } } },
    ]});
  }
  const where = and.length ? { AND: and } : {};

  const [total, schedules] = await Promise.all([
    prisma.amcSchedule.count({ where }),
    prisma.amcSchedule.findMany({
      where,
      include: {
        agreement: {
          select: {
            id: true, agreementNo: true, coCode: true, acctClassify: true,
            member: { select: { id: true, membershipNo: true, fullName: true } },
          },
        },
      },
      orderBy: { nextDueDate: 'asc' },
      skip, take,
    }),
  ]);
  res.json({ data: schedules, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
}

export async function getSchedule(req: Request, res: Response): Promise<void> {
  const schedule = await prisma.amcSchedule.findUnique({
    where: { id: req.params.id },
    include: {
      agreement: { include: { member: true, nominees: true } },
      invoices: { orderBy: [{ invoiceYearSeq: 'asc' }, { invComponent: 'asc' }] },
    },
  });
  if (!schedule) { res.status(404).json({ error: 'Schedule not found' }); return; }
  res.json({ data: schedule });
}

// Route: GET /api/agreements/:id/amc
export async function getScheduleByAgreement(req: Request, res: Response): Promise<void> {
  const schedule = await prisma.amcSchedule.findUnique({
    where: { agreementId: req.params.id },
    include: { invoices: { orderBy: [{ invoiceYearSeq: 'asc' }, { invComponent: 'asc' }] } },
  });
  if (!schedule) { res.status(404).json({ error: 'Schedule not found for this agreement' }); return; }
  res.json({ data: schedule });
}
