import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';

function parsePagination(query: Record<string, unknown>) {
  const page  = Math.max(1, parseInt(String(query.page  ?? 1), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? 20), 10)));
  return { skip: (page - 1) * limit, take: limit, page, limit };
}

export async function listSchedules(req: Request, res: Response): Promise<void> {
  const { skip, take, page, limit } = parsePagination(req.query as Record<string, unknown>);
  const { coCode, billingStatus, dueBefore, dueAfter, dueDate, q, acctClassify } = req.query as Record<string, string>;

  // Resolve acctClassify filter via natural key — the FK can point to the wrong
  // agreement for transferred cases, so we match by membershipNo+agreementNo pairs.
  let acctFilterPairs: { membershipNo: string; agreementNo: string }[] | null = null;
  if (acctClassify) {
    const agmtHits = await prisma.agreement.findMany({
      where: { acctClassify: acctClassify as any, ...(coCode ? { coCode } : {}) },
      select: { membershipNo: true, agreementNo: true },
    });
    acctFilterPairs = agmtHits.map(a => ({ membershipNo: a.membershipNo, agreementNo: a.agreementNo }));
  }

  const and: object[] = [];
  if (coCode)        and.push({ coCode });
  if (billingStatus) and.push({ billingStatus });
  if (acctFilterPairs !== null) {
    if (acctFilterPairs.length === 0) {
      and.push({ id: '__no_match__' });
    } else {
      and.push({ OR: acctFilterPairs.map(p => ({ membershipNo: p.membershipNo, agreementNo: p.agreementNo })) });
    }
  }
  if (dueDate) {
    // dueDate is a month value in `YYYY-MM` form — match the whole calendar month.
    // Fall back to a single-day range if a full `YYYY-MM-DD` date is supplied.
    const monthMatch = /^(\d{4})-(\d{2})$/.exec(dueDate);
    if (monthMatch) {
      const year = parseInt(monthMatch[1], 10);
      const month = parseInt(monthMatch[2], 10) - 1;
      const start = new Date(year, month, 1);
      const next = new Date(year, month + 1, 1);
      and.push({ nextDueDate: { gte: start, lt: next } });
    } else {
      const d = new Date(dueDate);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      and.push({ nextDueDate: { gte: d, lt: next } });
    }
  } else if (dueBefore || dueAfter) {
    and.push({ nextDueDate: {
      ...(dueAfter  ? { gte: new Date(dueAfter)  } : {}),
      ...(dueBefore ? { lte: new Date(dueBefore) } : {}),
    }});
  }
  if (q?.trim()) {
    const term = q.trim();
    const memberHits = await prisma.member.findMany({
      where: { fullName: { contains: term, mode: 'insensitive' } },
      select: { membershipNo: true },
    });
    const membershipNos = memberHits.map(m => m.membershipNo);
    const orClauses: object[] = [
      { agreementNo:  { contains: term, mode: 'insensitive' } },
      { membershipNo: { contains: term, mode: 'insensitive' } },
    ];
    if (membershipNos.length) {
      orClauses.push({ membershipNo: { in: membershipNos } });
    }
    and.push({ OR: orClauses });
  }
  const where = and.length ? { AND: and } : {};

  const [total, schedules] = await Promise.all([
    prisma.amcSchedule.count({ where }),
    prisma.amcSchedule.findMany({
      where,
      orderBy: [{ agreement: { acctClassify: 'asc' } }, { nextDueDate: 'asc' }],
      skip, take,
    }),
  ]);

  // Resolve correct agreement + member by natural key (membershipNo on schedule)
  // instead of relying on the FK, which can point to the wrong agreement
  // when agreementNo is reused across members (transfer cases).
  const enriched = await Promise.all(schedules.map(async (s) => {
    const agmt = await prisma.agreement.findFirst({
      where: { coCode: s.coCode, agreementNo: s.agreementNo, membershipNo: s.membershipNo },
      select: { id: true, agreementNo: true, coCode: true, acctClassify: true,
        member: { select: { id: true, membershipNo: true, fullName: true } } },
    });
    return { ...s, agreement: agmt };
  }));

  res.json({ data: enriched, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
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
