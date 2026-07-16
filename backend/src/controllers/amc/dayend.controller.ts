import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../utils/prisma';
import { writeAudit } from '../../utils/audit';

const OUTPUT_DIR = path.join(__dirname, '..', '..', '..', 'output', 'dayend');
const COCODE_ACCOUNT_PREFIX: Record<string, string> = { '03': '01', '15': '15', '02': '11' };

function fmtDate(d: Date): string { return d.toISOString().slice(0, 10).replace(/-/g, ''); }
function fmtDisplay(d: Date): string { return d.toLocaleDateString('en-MY', { day: '2-digit', month: '2-digit', year: 'numeric' }); }

// ─── generate ──────────────────────────────────────────────────────────────────

export async function generateDayEnd(req: Request, res: Response): Promise<void> {
  const dateStr = (req.body as { date?: string }).date;
  const runDate = dateStr ? new Date(dateStr) : new Date();
  runDate.setUTCHours(0, 0, 0, 0); // normalize to UTC midnight so invDate exact-match finds invoices created at UTC midnight (see invoices.controller); local setHours shifts the day on a UTC+8 server
  const dayStr = fmtDate(runDate);

  // Fetch all unprocessed invoices with invDate = runDate grouped by agreementId
  const invoices = await prisma.amcInvoice.findMany({
    where: { invDate: runDate, isProcessed: false },
    include: { agreement: { include: { member: true } } },
    orderBy: [{ coCode: 'asc' }, { agreementNo: 'asc' }, { invComponent: 'asc' }],
  });

  if (invoices.length === 0) {
    res.json({ message: 'No invoices to process for this date', files: [] });
    return;
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Group by agreementId → invoiceYearSeq
  type InvRow = typeof invoices[0];
  const byAgreement = new Map<string, InvRow[]>();
  for (const inv of invoices) {
    const key = `${inv.agreementId}::${inv.invoiceYearSeq ?? 0}`;
    if (!byAgreement.has(key)) byAgreement.set(key, []);
    byAgreement.get(key)!.push(inv);
  }

  // ── SL_IV file ───────────────────────────────────────────────────────────────
  const slLines: string[] = ['UDF_COMPANY_CODE|AREA|DOCDATE|POSTDATE|DOCNO|CURRENCY CODE|CURRENCY RATE|CODE|INVOICE DESCRIPTION|TERMS|DOCAMT|ITEM DESCRIPTION|QTY|UNIT PRICE|AMOUNT|TAX|TAXRATE|TAX AMOUNT|ACCOUNT'];

  // ── email files (one per coCode) ─────────────────────────────────────────────
  const emailLines: Record<string, string[]> = { '03': [], '15': [], '02': [] };
  const emailHeader = 'cocode|agmt_no|agmt_date|mem_no|name|email|addr1|addr2|addr3|addr4|postcode|state|inv_date|amc_yr|amc_qty|amc_rate|sfund_rate|amc_no|sfund_no|gst_no|rd_no|amc_amt|sfund_amt|gst_amt|rd_amt|currency|exp_date';
  for (const cc of ['03', '15', '02']) emailLines[cc].push(emailHeader);

  const emailTotals: Record<string, { count: number; amount: number }> = { '03': { count: 0, amount: 0 }, '15': { count: 0, amount: 0 }, '02': { count: 0, amount: 0 } };

  for (const [, group] of byAgreement) {
    const rep   = group[0];
    const agmt  = rep.agreement;
    const mem   = agmt.member;
    const cc    = rep.coCode;
    const pfx   = COCODE_ACCOUNT_PREFIX[cc] ?? '01';

    const mainInv = group.find((i) => i.invComponent === 'MAIN_AMC');
    const sfInv   = group.find((i) => i.invComponent === 'SINKING_FUND');
    const taxInv  = group.find((i) => i.invComponent === 'SERVICE_TAX');
    const rdInv   = group.find((i) => i.invComponent === 'ROUNDING');

    const amcAmt  = mainInv?.invAmount.toNumber() ?? 0;
    const sfAmt   = sfInv?.invAmount.toNumber()   ?? 0;
    const taxAmt  = taxInv?.invAmount.toNumber()  ?? 0;
    const rdAmt   = rdInv?.invAmount.toNumber()   ?? 0;
    const docTotal = amcAmt + sfAmt + taxAmt + rdAmt;

    const docNoParts = group.map((i) => i.invNo).filter(Boolean).join('/');
    const codeStr = agmt.agreementNo.trim();
    const yr = rep.invoiceYearSeq ?? 0;
    const calYear = runDate.getFullYear();
    const invDesc = `Pursuant to the Timeshare Agreement dated ${fmtDisplay(agmt.agreementDate)} the Annual Maintenance Charge for the ${yr}/${calYear} is due`;
    const currCode = rep.rate?.toNumber() === 1 ? 'RM' : 'S$';
    const rateStr  = rep.rate?.toFixed(4) ?? '1.0000';

    // AMC row
    slLines.push([
      cc, mem.branchCode ?? '', fmtDate(runDate), fmtDate(runDate),
      docNoParts, currCode, rateStr, codeStr, invDesc, '30',
      docTotal.toFixed(2),
      'Annual Maintenance Charges', '1', amcAmt.toFixed(2), amcAmt.toFixed(2),
      'SV', '8%', taxAmt.toFixed(2), `${pfx}99-42000`,
    ].join('|'));

    // SF row
    slLines.push([
      cc, mem.branchCode ?? '', fmtDate(runDate), fmtDate(runDate),
      docNoParts, currCode, rateStr, codeStr, invDesc, '30',
      docTotal.toFixed(2),
      '10% Sinking Fund', '1', sfAmt.toFixed(2), sfAmt.toFixed(2),
      '', '', '', `${pfx}99-42010`,
    ].join('|'));

    // CP rounding row
    if (rdInv) {
      slLines.push([
        cc, mem.branchCode ?? '', fmtDate(runDate), fmtDate(runDate),
        docNoParts, currCode, rateStr, codeStr, invDesc, '30',
        docTotal.toFixed(2),
        'Rounding Adjustment', '1', rdAmt.toFixed(2), rdAmt.toFixed(2),
        '', '', '', `1199-30504`,
      ].join('|'));
    }

    // Email blast row (members with email only)
    if (mem.email && emailLines[cc]) {
      emailLines[cc].push([
        cc, codeStr, fmtDisplay(agmt.agreementDate), mem.membershipNo,
        mem.fullName, mem.email,
        mem.mailAdd1 ?? mem.resAdd1 ?? '',
        mem.mailAdd2 ?? mem.resAdd2 ?? '',
        mem.mailAdd3 ?? mem.resAdd3 ?? '',
        mem.mailCityState ?? mem.resCityState ?? '',
        mem.mailPostcode  ?? mem.resPostcode  ?? '',
        mem.mailStateCode ?? mem.resStateCode ?? '',
        fmtDisplay(runDate), `${yr}/${calYear}`,
        mainInv?.totalPoints ?? '1',
        amcAmt.toFixed(2), sfAmt.toFixed(2),
        mainInv?.invNo ?? '', sfInv?.invNo ?? '', taxInv?.invNo ?? '', rdInv?.invNo ?? '',
        amcAmt.toFixed(2), sfAmt.toFixed(2), taxAmt.toFixed(2), rdAmt.toFixed(2),
        currCode,
        agmt.endDate ? fmtDisplay(agmt.endDate) : '',
      ].join('|'));

      emailTotals[cc].count++;
      emailTotals[cc].amount += docTotal;
    }
  }

  // ── write files ───────────────────────────────────────────────────────────────
  const generatedFiles: string[] = [];

  const slFile = `SL_IV${dayStr}.csv`;
  fs.writeFileSync(path.join(OUTPUT_DIR, slFile), slLines.join('\n'), 'utf8');
  generatedFiles.push(slFile);

  for (const cc of ['03', '15', '02']) {
    if (emailLines[cc].length <= 1) continue; // header only — skip

    const emailFile = `amcemail${cc}${dayStr}.csv`;
    fs.writeFileSync(path.join(OUTPUT_DIR, emailFile), emailLines[cc].join('\n'), 'utf8');
    generatedFiles.push(emailFile);

    const hashFile = `amc_hash_ttl${cc}${dayStr}.txt`;
    const hashContent = `${emailTotals[cc].count}|${emailTotals[cc].amount.toFixed(2)}|`;
    fs.writeFileSync(path.join(OUTPUT_DIR, hashFile), hashContent, 'utf8');
    generatedFiles.push(hashFile);
  }

  // Mark invoices as processed
  await prisma.amcInvoice.updateMany({
    where: { invDate: runDate, isProcessed: false },
    data: { isProcessed: true, processedAt: new Date() },
  });

  await writeAudit({
    userId: req.user.id,
    action: `Generated day-end files for ${runDate.toISOString().slice(0, 10)}`,
    actionType: 'CREATE',
    targetType: 'DayEnd',
    metadata: { date: dayStr, files: generatedFiles, agreementCount: byAgreement.size },
  });

  res.json({
    message: `Day-end files generated for ${runDate.toISOString().slice(0, 10)}`,
    files: generatedFiles.map((f) => ({ name: f, url: `/api/amc/dayend/download/${f}` })),
    summary: {
      totalAgreements: byAgreement.size,
      totals: emailTotals,
    },
  });
}

// ─── list history ──────────────────────────────────────────────────────────────

export async function listDayEndHistory(_req: Request, res: Response): Promise<void> {
  if (!fs.existsSync(OUTPUT_DIR)) { res.json({ data: [] }); return; }

  const files = fs.readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith('.csv') || f.endsWith('.txt'))
    .map((f) => {
      const stat = fs.statSync(path.join(OUTPUT_DIR, f));
      return { name: f, size: stat.size, createdAt: stat.birthtime, url: `/api/amc/dayend/download/${f}` };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  res.json({ data: files });
}

// ─── download ──────────────────────────────────────────────────────────────────

export async function downloadDayEndFile(req: Request, res: Response): Promise<void> {
  // Sanitise filename — no path traversal
  const filename = path.basename(req.params.filename);
  if (!filename.match(/^[a-zA-Z0-9_\-\.]+$/) || filename.includes('..')) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }

  const filePath = path.join(OUTPUT_DIR, filename);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'File not found' }); return; }

  const ext  = path.extname(filename);
  const mime = ext === '.csv' ? 'text/csv' : 'text/plain';
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  fs.createReadStream(filePath).pipe(res);
}
