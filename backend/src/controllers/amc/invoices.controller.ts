import { Request, Response } from 'express';
import { z } from 'zod';
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

function addOneYear(d: Date): Date {
  return new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
}

function nextLhcDueDate(after: Date): Date {
  // LHC bills on Jan 1 or Jul 1 — pick the next one after `after`
  const y = after.getFullYear();
  const jul = new Date(y, 6, 1);   // July 1
  const jan = new Date(y + 1, 0, 1); // Jan 1 next year
  return after < jul ? jul : jan;
}

// ─── list ─────────────────────────────────────────────────────────────────────

export async function listInvoices(req: Request, res: Response): Promise<void> {
  const { skip, take, page, limit } = parsePagination(req.query as Record<string, unknown>);
  const { coCode, billType, from, to, agreementId, scheduleId } = req.query as Record<string, string>;

  const where: Record<string, unknown> = {};
  if (coCode)      where.coCode      = coCode;
  if (billType)    where.billType    = billType;
  if (agreementId) where.agreementId = agreementId;
  if (scheduleId)  where.scheduleId  = scheduleId;
  if (from || to)  where.invDate     = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };

  const [total, invoices] = await Promise.all([
    prisma.amcInvoice.count({ where }),
    prisma.amcInvoice.findMany({
      where,
      include: { agreement: { select: { agreementNo: true, member: { select: { membershipNo: true, fullName: true } } } } },
      orderBy: [{ invDate: 'desc' }, { invNo: 'asc' }],
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
  invDate: z.string().datetime().optional(),
  coCode:  z.string().optional(),
});

export async function generateInvoices(req: Request, res: Response): Promise<void> {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const invDate = parsed.data.invDate ? new Date(parsed.data.invDate) : new Date();
  invDate.setHours(0, 0, 0, 0);

  const coCodeFilter = parsed.data.coCode;

  // Find due active schedules
  const schedules = await prisma.amcSchedule.findMany({
    where: {
      billingStatus: 'N',
      nextDueDate: { lte: invDate },
      ...(coCodeFilter ? { coCode: coCodeFilter } : {}),
      agreement: { acctClassify: 'NA' },
    },
    include: { agreement: { include: { member: true } } },
  });

  if (schedules.length === 0) {
    res.json({ message: 'No schedules due', generated: 0 });
    return;
  }

  let generated = 0;

  for (const schedule of schedules) {
    const { agreement } = schedule;
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

          const amcAmt   = new Prisma.Decimal(pts).mul(tier.amcRatePerPoint);
          const sfAmt    = amcAmt.mul(tier.sinkingFundPct).div(100);
          const taxAmt   = amcAmt.mul(tier.gstPct).div(100);
          const calcSum  = amcAmt.add(sfAmt).add(taxAmt).toDecimalPlaces(2);
          const floored  = new Prisma.Decimal(Math.floor(calcSum.toNumber()));
          const rounding = floored.sub(calcSum);

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
            },
          });
        }

        generated++;
      });
    } catch (err) {
      console.error(`Failed to generate invoice for schedule ${schedule.id}:`, err);
    }
  }

  await writeAudit({
    userId: req.user.id,
    action: `Generated ${generated} invoice set(s) for ${invDate.toISOString().slice(0, 10)}`,
    actionType: 'CREATE',
    targetType: 'AmcInvoice',
    metadata: { invDate: invDate.toISOString(), generated },
  });

  res.json({ message: `Generated invoices for ${generated} agreement(s)`, generated });
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
    data: { printCount: invoice.printCount + 1, printDate: new Date(), printUser: req.user.username },
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
