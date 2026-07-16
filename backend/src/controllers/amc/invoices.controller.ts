import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { Prisma, InvComponent, BillType } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { writeAudit } from '../../utils/audit';

// ─── helpers ─────────────────────────────────────────────────────────────────

function parsePagination(query: Record<string, unknown>) {
  const page  = Math.max(1, parseInt(String(query.page  ?? 1), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? 20), 10)));
  return { skip: (page - 1) * limit, take: limit, page, limit };
}

const PREFIX_MAP: Record<InvComponent, string> = {
  MAIN_AMC:     'A',
  SINKING_FUND: 'K',
  SERVICE_TAX:  'S',
  ROUNDING:     'Y',
};

async function allocateInvSeq(tx: Prisma.TransactionClient): Promise<string> {
  const result = await tx.$queryRaw<Array<{ max_n: bigint | null }>>`
    SELECT MAX(
      CASE WHEN "invNo" ~ '^[AKSY][0-9]{7}$'
      THEN CAST(SUBSTRING("invNo" FROM 2) AS INTEGER)
      ELSE 0 END
    ) AS max_n
    FROM "AmcInvoice"
  `;
  const maxN = result[0]?.max_n ? Number(result[0].max_n) : 999999;
  return String(maxN + 1).padStart(7, '0');
}

// Date math is done in UTC so results land on clean UTC midnight (matching how
// nextDueDate is stored). Local constructors would drift to the prev day 16:00Z
// on a UTC+8 server, which — with month-boundary billing — bills an agreement a month early.
function addOneYear(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
}

function nextLhcDueDate(after: Date): Date {
  // LHC bills on Jan 1 or Jul 1 — pick the next one after `after`
  const y = after.getUTCFullYear();
  const jul = new Date(Date.UTC(y, 6, 1));     // July 1
  const jan = new Date(Date.UTC(y + 1, 0, 1)); // Jan 1 next year
  return after < jul ? jul : jan;
}

// Reverse helpers — only used as a fallback when an invoice predates the pre-billing snapshot.
function subOneYear(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate()));
}
function prevLhcDueDate(before: Date): Date {
  // the Jan 1 / Jul 1 immediately before `before` (reverse of nextLhcDueDate)
  const y = before.getUTCFullYear();
  const jan = new Date(Date.UTC(y, 0, 1));
  const jul = new Date(Date.UTC(y, 6, 1));
  if (before > jul) return jul;
  if (before > jan) return jan;
  return new Date(Date.UTC(y - 1, 6, 1));
}

// ─── list ─────────────────────────────────────────────────────────────────────

export async function listInvoices(req: Request, res: Response): Promise<void> {
  const { skip, take, page, limit } = parsePagination(req.query as Record<string, unknown>);
  const { coCode, billType, from, to, agreementId, scheduleId, q } = req.query as Record<string, string>;

  const where: Record<string, unknown> = {};
  if (coCode)      where.coCode      = coCode;
  if (billType)    where.billType    = billType;
  if (agreementId) where.agreementId = agreementId;
  if (scheduleId)  where.scheduleId  = scheduleId;
  if (from || to)  where.invDate     = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
  if (q?.trim()) {
    const term = q.trim();
    // Name isn't stored on AmcInvoice — resolve member name -> membershipNos first
    const memberHits = await prisma.member.findMany({
      where: { fullName: { contains: term, mode: 'insensitive' } },
      select: { membershipNo: true },
    });
    const membershipNos = memberHits.map(m => m.membershipNo);
    const orClauses: object[] = [
      { membershipNo: { contains: term, mode: 'insensitive' } },
      { agreementNo:  { contains: term, mode: 'insensitive' } },
    ];
    if (membershipNos.length) orClauses.push({ membershipNo: { in: membershipNos } });
    where.OR = orClauses;
  }

  const [total, invoices] = await Promise.all([
    prisma.amcInvoice.count({ where }),
    prisma.amcInvoice.findMany({
      where,
      include: { agreement: { select: { agreementNo: true, member: { select: { membershipNo: true, fullName: true } } } } },
      orderBy: [{ invDate: 'desc' }, { agreementNo: 'asc' }, { invNo: 'asc' }],
      skip, take,
    }),
  ]);
  res.json({ data: invoices, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
}

// ─── get one ──────────────────────────────────────────────────────────────────

export async function getInvoice(req: Request, res: Response): Promise<void> {
  const invoice = await prisma.amcInvoice.findUnique({
    where: { id: req.params.id },
    include: {
      agreement: { include: { member: true, nominees: true } },
      schedule: true,
    },
  });
  if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
  res.json({ data: invoice });
}

// ─── generate ─────────────────────────────────────────────────────────────────

const generateSchema = z.object({
  productType: z.enum(['CP', 'LHC']).optional(), // CP = coCode 02; LHC = coCode 03 + 15
  period:      z.string().regex(/^\d{4}-\d{2}$/).optional(), // YYYY-MM billing period
  agreementNo: z.string().trim().optional(),      // blank = all agreements
});

// CP is billed monthly; LHC is billed only in Jan & July. Both map product -> coCode(s).
const PRODUCT_COCODES: Record<'CP' | 'LHC', string[]> = { CP: ['02'], LHC: ['03', '15'] };

export async function generateInvoices(req: Request, res: Response): Promise<void> {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  // Resolve the billing period (YYYY-MM). Default to the current period.
  const now = new Date();
  const [pY, pM] = parsed.data.period
    ? parsed.data.period.split('-').map(Number)
    : [now.getUTCFullYear(), now.getUTCMonth() + 1];

  // Invoice/DOC date = 1st of the period month; selection window = strictly before the 1st of next month
  // (i.e. nextDueDate on/before the period's month-end). All at UTC midnight to match stored dates.
  const invDate       = new Date(Date.UTC(pY, pM - 1, 1));
  const nextMonthStart = new Date(Date.UTC(pY, pM, 1));

  const coCodes     = parsed.data.productType ? PRODUCT_COCODES[parsed.data.productType] : undefined;
  const agreementNo = parsed.data.agreementNo || undefined;

  // Find due active schedules
  const schedules = await prisma.amcSchedule.findMany({
    where: {
      billingStatus: 'N',
      nextDueDate: { lt: nextMonthStart },
      ...(coCodes ? { coCode: { in: coCodes } } : {}),
      ...(agreementNo ? { agreementNo } : {}),
      agreement: { acctClassify: 'NA' },
    },
    include: { agreement: { include: { member: true } } },
  });

  if (schedules.length === 0) {
    res.json({ message: 'No schedules due', generated: 0 });
    return;
  }

  let generated = 0;
  const skipped: { agreementNo: string; membershipNo: string; reason: string }[] = [];

  for (const schedule of schedules) {
    const { agreement } = schedule;

    // Never bill beyond the agreement's term. Some migrated schedules arrive fully billed
    // (invoicesIssued == totalInvoices) yet still billingStatus='N' with a nextDueDate — without
    // this guard they'd be billed one extra year. Report as skipped rather than silently exclude.
    if (schedule.invoicesIssued >= schedule.totalInvoices) {
      skipped.push({
        agreementNo: schedule.agreementNo,
        membershipNo: schedule.membershipNo,
        reason: `Already fully billed (${schedule.invoicesIssued}/${schedule.totalInvoices}) — no invoice generated`,
      });
      continue;
    }

    const isLhc = schedule.coCode !== '02';
    const invoiceYearSeq = schedule.invoicesIssued + 1;
    const isFinalYear = invoiceYearSeq >= schedule.totalInvoices;
    const billType: BillType = isFinalYear ? 'F' : 'N';

    try {
      await prisma.$transaction(async (tx) => {
        const seq = await allocateInvSeq(tx);

        if (isLhc) {
          // Get latest AMC price for coCode + priceCode
          const rate = await tx.amcPrice.findFirst({
            where: { coCode: schedule.coCode, priceCode: schedule.priceCode ?? 'M' },
            orderBy: { effectiveDate: 'desc' },
          });
          if (!rate) throw new Error(`No AMC rate found for coCode=${schedule.coCode} priceCode=${schedule.priceCode}`);

          const components: Array<{ component: InvComponent; amount: Prisma.Decimal }> = [
            { component: 'MAIN_AMC',     amount: rate.amcAmount },
            { component: 'SINKING_FUND', amount: rate.sinkingFund },
            { component: 'SERVICE_TAX',  amount: rate.serviceTax },
          ];

          const docNo = agreement.agreementNo.trim();

          for (const { component, amount } of components) {
            await tx.amcInvoice.create({
              data: {
                id:             randomUUID(),
                scheduleId:     schedule.id,
                agreementId:    agreement.id,
                membershipNo:   agreement.membershipNo,
                agreementNo:    agreement.agreementNo,
                docNo,
                invNo:          `${PREFIX_MAP[component]}${seq}`,
                invComponent:   component,
                invDate,
                amcDate:        invDate,
                dueDate:        invDate,
                invoiceYearSeq,
                invAmount:      amount,
                rate:           rate.rate,
                billType,
                coCode:         schedule.coCode,
                prevNextDueDate:     schedule.nextDueDate,     // snapshot for exact cancel rollback
                prevLastInvoiceDate: schedule.lastInvoiceDate,
                updatedAt:      new Date(),
              },
            });
          }

          const nextDue = isFinalYear ? null : nextLhcDueDate(invDate);
          await tx.amcSchedule.update({
            where: { id: schedule.id },
            data: {
              invoicesIssued:  invoiceYearSeq,
              lastInvoiceDate: invDate,
              nextDueDate:     nextDue,
              billingStatus:   isFinalYear ? 'C' : 'N',
              updatedAt:       new Date(),
            },
          });

        } else {
          // CP billing
          const pts = agreement.totalPoints ?? 0;
          const tier = await tx.amcPricePoints.findFirst({
            where: { coCode: '02', minPoints: { lte: pts }, maxPoints: { gte: pts } },
            orderBy: { effectiveDate: 'desc' },
          });
          if (!tier) throw new Error(`No CP rate tier found for totalPoints=${pts}`);

          // amcRatePerPoint is the all-in maintenance rate per point; sinking fund is carved OUT of it
          // (not added on top). Service tax is 8% of the rounded MAIN_AMC.
          const ptsDec       = new Prisma.Decimal(pts);
          const sfPerPoint   = tier.amcRatePerPoint.mul(tier.sinkingFundPct).div(100); // e.g. 0.1 * 2.561
          const mainPerPoint = tier.amcRatePerPoint.sub(sfPerPoint);                   // e.g. 2.561 - 0.2561

          const amcAmt   = ptsDec.mul(mainPerPoint).toDecimalPlaces(2);       // MAIN_AMC     e.g. 288.11
          const sfAmt    = ptsDec.mul(sfPerPoint).toDecimalPlaces(2);         // SINKING_FUND e.g. 32.01
          const taxAmt   = amcAmt.mul(tier.gstPct).div(100).toDecimalPlaces(2); // tax on rounded main: 23.05
          const calcSum  = amcAmt.add(sfAmt).add(taxAmt).toDecimalPlaces(2);  // e.g. 343.17
          const floored  = new Prisma.Decimal(Math.floor(calcSum.toNumber()));
          const rounding = floored.sub(calcSum);                             // e.g. -0.17 (floor to whole RM)

          const components: Array<{ component: InvComponent; amount: Prisma.Decimal }> = [
            { component: 'MAIN_AMC',     amount: amcAmt.toDecimalPlaces(2) },
            { component: 'SINKING_FUND', amount: sfAmt.toDecimalPlaces(2) },
            { component: 'SERVICE_TAX',  amount: taxAmt.toDecimalPlaces(2) },
            { component: 'ROUNDING',     amount: rounding.toDecimalPlaces(2) },
          ];

          const docNo = `${agreement.agreementNo.trim()}-1`;

          for (const { component, amount } of components) {
            await tx.amcInvoice.create({
              data: {
                id:             randomUUID(),
                scheduleId:     schedule.id,
                agreementId:    agreement.id,
                membershipNo:   agreement.membershipNo,
                agreementNo:    agreement.agreementNo,
                docNo,
                invNo:          `${PREFIX_MAP[component]}${seq}`,
                invComponent:   component,
                invDate,
                amcDate:        invDate,
                dueDate:        invDate,
                invoiceYearSeq,
                invAmount:      amount,
                totalPoints:    pts,
                billType,
                coCode:         '02',
                prevNextDueDate:     schedule.nextDueDate,     // snapshot for exact cancel rollback
                prevLastInvoiceDate: schedule.lastInvoiceDate,
                updatedAt:      new Date(),
              },
            });
          }

          const nextDue = isFinalYear ? null : addOneYear(schedule.nextDueDate ?? invDate);
          await tx.amcSchedule.update({
            where: { id: schedule.id },
            data: {
              invoicesIssued:  invoiceYearSeq,
              lastInvoiceDate: invDate,
              nextDueDate:     nextDue,
              billingStatus:   isFinalYear ? 'C' : 'N',
              updatedAt:       new Date(),
            },
          });
        }

        generated++;
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`Failed to generate invoice for schedule ${schedule.id}:`, err);
      skipped.push({ agreementNo: schedule.agreementNo, membershipNo: schedule.membershipNo, reason });
    }
  }

  await writeAudit({
    userId: req.user.id,
    action: `Generated ${generated} invoice set(s) for period ${pY}-${String(pM).padStart(2, '0')}`,
    actionType: 'CREATE',
    targetType: 'AmcInvoice',
    metadata: {
      period: `${pY}-${String(pM).padStart(2, '0')}`,
      invDate: invDate.toISOString(),
      productType: parsed.data.productType ?? 'ALL',
      agreementNo: agreementNo ?? 'ALL',
      generated,
      skipped: skipped.length,
    },
  });

  res.json({ message: `Generated invoices for ${generated} agreement(s)`, generated, skipped });
}

// ─── cancellation ───────────────────────────────────────────────────────────────

// GET /api/amc/invoices/cancellable?q= — unprocessed invoice sets, searchable by membership/agreement/invoice no
export async function listCancellableInvoices(req: Request, res: Response): Promise<void> {
  const q = (req.query.q as string | undefined)?.trim();

  const where: Record<string, unknown> = { isProcessed: false };
  if (q) {
    where.OR = [
      { membershipNo: { contains: q, mode: 'insensitive' } },
      { agreementNo:  { contains: q, mode: 'insensitive' } },
      { invNo:        { contains: q, mode: 'insensitive' } },
    ];
  }

  // Matched rows -> distinct (scheduleId, invoiceYearSeq) invoice-set keys (cap at 50 sets)
  const matches = await prisma.amcInvoice.findMany({
    where, select: { scheduleId: true, invoiceYearSeq: true }, take: 400,
  });
  const keyset = new Map<string, { scheduleId: string; invoiceYearSeq: number }>();
  for (const m of matches) {
    const k = `${m.scheduleId}::${m.invoiceYearSeq ?? 0}`;
    if (!keyset.has(k)) keyset.set(k, { scheduleId: m.scheduleId, invoiceYearSeq: m.invoiceYearSeq ?? 0 });
    if (keyset.size >= 50) break;
  }
  if (keyset.size === 0) { res.json({ data: [] }); return; }

  // Fetch the full unprocessed set for each key (so an invNo-only match still returns all components)
  const keys = [...keyset.values()];
  const rows = await prisma.amcInvoice.findMany({
    where: { isProcessed: false, OR: keys.map(k => ({ scheduleId: k.scheduleId, invoiceYearSeq: k.invoiceYearSeq })) },
    orderBy: [{ invComponent: 'asc' }],
  });

  // Resolve member names by membershipNo (transfer-safe — membershipNo is on the invoice)
  const memNos = [...new Set(rows.map(r => r.membershipNo))];
  const members = await prisma.member.findMany({
    where: { membershipNo: { in: memNos } }, select: { membershipNo: true, fullName: true },
  });
  const nameByMem = new Map(members.map(m => [m.membershipNo, m.fullName]));

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.scheduleId}::${r.invoiceYearSeq ?? 0}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  const data = [...groups.values()].map((set) => {
    const main  = set.find(i => i.invComponent === 'MAIN_AMC') ?? set[0];
    const total = set.reduce((s, i) => s.add(i.invAmount), new Prisma.Decimal(0));
    return {
      id: main.id, // MAIN_AMC row id — used to cancel the whole set
      invNo: main.invNo,
      invNos: set.map(i => i.invNo),
      agreementNo: main.agreementNo,
      membershipNo: main.membershipNo,
      memberName: nameByMem.get(main.membershipNo) ?? '',
      coCode: main.coCode,
      invDate: main.invDate,
      invoiceYearSeq: main.invoiceYearSeq,
      totalAmount: total.toFixed(2),
    };
  });
  data.sort((a, b) => (b.invDate.getTime() - a.invDate.getTime()) || a.agreementNo.localeCompare(b.agreementNo));

  res.json({ data });
}

// POST /api/amc/invoices/:id/cancel — cancel a whole unprocessed invoice + roll back its schedule
export async function cancelInvoice(req: Request, res: Response): Promise<void> {
  const reason = (req.body?.reason as string | undefined)?.trim() || undefined;

  const invoice = await prisma.amcInvoice.findUnique({
    where: { id: req.params.id }, include: { schedule: true },
  });
  if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
  if (invoice.isProcessed) { res.status(400).json({ error: 'Cannot cancel a processed invoice' }); return; }

  const yearSeq  = invoice.invoiceYearSeq ?? 0;
  const siblings = await prisma.amcInvoice.findMany({
    where: { scheduleId: invoice.scheduleId, invoiceYearSeq: yearSeq },
  });
  if (siblings.some(s => s.isProcessed)) {
    res.status(400).json({ error: 'Cannot cancel: part of this invoice has already been processed' });
    return;
  }

  // Restore the schedule to its pre-billing state
  let restoredNextDue: Date | null = invoice.prevNextDueDate ?? null;
  if (invoice.prevNextDueDate == null) {
    // Fallback for invoices generated before the snapshot existed (shouldn't occur for new invoices)
    const cur = invoice.schedule.nextDueDate;
    if (cur == null) {
      res.status(400).json({ error: 'Cannot cancel: missing pre-billing snapshot for a final-year invoice. Please roll back manually.' });
      return;
    }
    restoredNextDue = invoice.coCode === '02' ? subOneYear(cur) : prevLhcDueDate(cur);
  }
  const restoredLastInv = invoice.prevLastInvoiceDate ?? null;
  const invNos = siblings.map(s => s.invNo);

  await prisma.$transaction(async (tx) => {
    await tx.amcSchedule.update({
      where: { id: invoice.scheduleId },
      data: {
        invoicesIssued:  Math.max(0, yearSeq - 1),
        billingStatus:   'N',
        nextDueDate:     restoredNextDue,
        lastInvoiceDate: restoredLastInv,
        updatedAt:       new Date(),
      },
    });
    await tx.amcInvoice.deleteMany({ where: { scheduleId: invoice.scheduleId, invoiceYearSeq: yearSeq } });
    await writeAudit({
      tx,
      userId: req.user.id,
      action: `Cancelled invoice ${invoice.invNo} (${invoice.agreementNo})`,
      actionType: 'DELETE',
      targetType: 'AmcInvoice',
      metadata: {
        invNos, agreementNo: invoice.agreementNo, membershipNo: invoice.membershipNo,
        invoiceYearSeq: yearSeq, coCode: invoice.coCode, reason: reason ?? null,
      },
    });
  });

  res.json({ message: `Invoice ${invoice.invNo} cancelled (${invNos.length} line(s) removed)` });
}

// ─── PDF download ──────────────────────────────────────────────────────────────

export async function downloadInvoicePdf(req: Request, res: Response): Promise<void> {
  const invoice = await prisma.amcInvoice.findUnique({
    where: { id: req.params.id },
    include: { agreement: { include: { member: true } }, schedule: true },
  });
  if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }

  // Update print tracking
  await prisma.amcInvoice.update({
    where: { id: invoice.id },
    data: { printCount: invoice.printCount + 1, printDate: new Date(), printUser: req.user.username, updatedAt: new Date() },
  });

  // Fetch all sibling invoices for the same agreementNo + invoiceYearSeq
  const siblings = await prisma.amcInvoice.findMany({
    where: { agreementId: invoice.agreementId, invoiceYearSeq: invoice.invoiceYearSeq ?? 0 },
    orderBy: { invComponent: 'asc' },
  });

  const mainInv  = siblings.find((i) => i.invComponent === 'MAIN_AMC');
  const sfInv    = siblings.find((i) => i.invComponent === 'SINKING_FUND');
  const taxInv   = siblings.find((i) => i.invComponent === 'SERVICE_TAX');
  const rdInv    = siblings.find((i) => i.invComponent === 'ROUNDING');

  const member   = invoice.agreement.member;
  const agmt     = invoice.agreement;

  const amcAmt   = mainInv?.invAmount.toNumber()  ?? 0;
  const sfAmt    = sfInv?.invAmount.toNumber()    ?? 0;
  const taxAmt   = taxInv?.invAmount.toNumber()   ?? 0;
  const rdAmt    = rdInv?.invAmount.toNumber()    ?? 0;
  const total    = amcAmt + sfAmt + taxAmt + rdAmt;

  // Build a simple text-based PDF response (placeholder — replace with pdfkit in production)
  const lines = [
    'LEISURE HOLIDAYS BHD',
    'Suite 8.01, 8th Floor, Menara Maxisegar,',
    'Jalan Pandan Indah 4/2, Pandan Indah,',
    '55100 Kuala Lumpur.',
    'Tel: 03-4296 8888  Fax: 03-4296 8800',
    'www.leisureholidays.com.my',
    'ST No: B16-1808-31013940',
    '',
    `Member: ${member.fullName}`,
    `Membership No: ${invoice.membershipNo}`,
    `Agreement No:  ${invoice.agreementNo}`,
    `Invoice Date:  ${invoice.invDate.toLocaleDateString('en-MY')}`,
    '',
    `Invoice No (AMC):  ${mainInv?.invNo  ?? '-'}`,
    `Invoice No (SF):   ${sfInv?.invNo   ?? '-'}`,
    `Invoice No (Tax):  ${taxInv?.invNo  ?? '-'}`,
    ...(rdInv ? [`Invoice No (Rnd):  ${rdInv.invNo}`] : []),
    '',
    'PARTICULARS                          QTY  UNIT PRICE      TOTAL',
    '----------------------------------------------------------------',
    `Annual Maintenance Charges             1  ${amcAmt.toFixed(2).padStart(12)}  ${amcAmt.toFixed(2).padStart(12)}`,
    `10% Sinking Fund                       1  ${sfAmt.toFixed(2).padStart(12)}  ${sfAmt.toFixed(2).padStart(12)}`,
    '----------------------------------------------------------------',
    `Sub-total                                                 ${(amcAmt + sfAmt).toFixed(2).padStart(12)}`,
    `Service Tax 8%                                            ${taxAmt.toFixed(2).padStart(12)}`,
    ...(rdInv ? [`Rounding Adjustment                                       ${rdAmt.toFixed(2).padStart(12)}`] : []),
    '================================================================',
    `TOTAL                                                     ${total.toFixed(2).padStart(12)}`,
    '',
    'Pursuant to the Timeshare Agreement dated',
    `${agmt.agreementDate.toLocaleDateString('en-MY')}`,
    '',
    'This is a computer generated Invoice and no signature is required.',
  ];

  const content = lines.join('\n');
  const filename = `INV_${mainInv?.invNo ?? invoice.invNo}.txt`;

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(content);
}
