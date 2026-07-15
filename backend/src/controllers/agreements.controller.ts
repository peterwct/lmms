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
    membershipNo, agreementNo, name, icNew, icOld, jaName, spouseName, nomineeName, email, companyName, phone,
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
  if (email?.trim())        and.push({ member: { email:    { contains: email.trim(), mode: 'insensitive' } } });
  if (companyName?.trim())  and.push({ member: { companyName: { contains: companyName.trim(), mode: 'insensitive' } } });

  // Phone search — matches ANY phone/fax field on the Member. Numbers are stored in
  // mixed formats (with and without dashes, e.g. "017-6822868" vs "0194714131"), so we
  // strip non-digits from both the stored value and the search term before comparing.
  // Resolved via raw SQL to member ids (a phone match returns very few members, so the
  // resulting `memberId IN (...)` list is tiny — well under Postgres' bind-var cap).
  if (phone?.trim()) {
    const digits = phone.replace(/\D/g, '');
    if (digits) {
      const pat = `%${digits}%`;
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Member" WHERE
             regexp_replace(COALESCE("telHome",     ''), '[^0-9]', '', 'g') LIKE ${pat}
          OR regexp_replace(COALESCE("telMobile",   ''), '[^0-9]', '', 'g') LIKE ${pat}
          OR regexp_replace(COALESCE("telOffice",   ''), '[^0-9]', '', 'g') LIKE ${pat}
          OR regexp_replace(COALESCE("telOffice2",  ''), '[^0-9]', '', 'g') LIKE ${pat}
          OR regexp_replace(COALESCE("jaTelHome",   ''), '[^0-9]', '', 'g') LIKE ${pat}
          OR regexp_replace(COALESCE("jaTelOffice", ''), '[^0-9]', '', 'g') LIKE ${pat}
          OR regexp_replace(COALESCE("jaMobile",    ''), '[^0-9]', '', 'g') LIKE ${pat}
          OR regexp_replace(COALESCE("faxNo",       ''), '[^0-9]', '', 'g') LIKE ${pat}
          OR regexp_replace(COALESCE("faxOffice",   ''), '[^0-9]', '', 'g') LIKE ${pat}`;
      and.push(rows.length ? { memberId: { in: rows.map(r => r.id) } } : { id: '__none__' });
    } else {
      // Non-numeric input — a phone search that can't match anything.
      and.push({ id: '__none__' });
    }
  }

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

  // Entitlement Balance (LHC 03/15 only): remaining un-utilized nights per membership
  // year, ported from the Informix SP get_entitlement_balance. Each membership year is
  // entitled to 7 nights (of which <=1 may be a weekend night). The be_year/be_wk column
  // feeding each display column is chosen by MEMBERSHIP year (anniversary-adjusted using
  // the agreement's expiry month/day), NOT by calendar-year offset. Column headers stay a
  // current-calendar-year window (Acc = year-1, Curr = year, Ad1..Ad5 = year+1..+5).
  // Usage matched by natural key (coCode + membershipNo + agreementNo).
  // Terminated (TM) agreements never show the card — the entitlement no longer applies.
  let entitlementBalance:
    | {
        columns: { label: string; year: number; nights: number; weekend: number }[];
        forfeitedNights: number;
        usableNights: number;
        usedNights: number;
        usedYear: number;
      }
    | null = null;
  if ((agreement.coCode === '03' || agreement.coCode === '15') && agreement.acctClassify !== 'TM') {
    const usage = await prisma.bookingEntitlement.findMany({
      where: {
        coCode: agreement.coCode,
        membershipNo: agreement.membershipNo,
        agreementNo: agreement.agreementNo,
      },
      select: { yearSeq: true, nightsUsed: true, actualNights: true, weekendUsed: true },
    });
    const usedBySeq = new Map(usage.map(u => [u.yearSeq, u]));

    const agmtYear = agreement.agreementDate.getFullYear();
    const rawExpiry = agreement.endDate
      ? agreement.endDate
      : new Date(agmtYear + agreement.termYears, agreement.agreementDate.getMonth(), agreement.agreementDate.getDate());
    // Normalize to local date-only so day comparisons don't skew across timezones.
    const expiry = new Date(rawExpiry.getFullYear(), rawExpiry.getMonth(), rawExpiry.getDate());
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const addYears = (d: Date, n: number) => new Date(d.getFullYear() + n, d.getMonth(), d.getDate());

    // SP index rule: the membership year currently in progress is decided by whether this
    // year's anniversary (expiry month/day) has passed; accrueIdx = that current index - 1.
    const passed =
      today.getMonth() > expiry.getMonth() ||
      (today.getMonth() === expiry.getMonth() && today.getDate() >= expiry.getDate());
    const accrueIdx = passed ? today.getFullYear() - agmtYear : today.getFullYear() - agmtYear - 1;

    const labels = ['Acc', 'Curr', 'Ad1', 'Ad2', 'Ad3', 'Ad4', 'Ad5'];
    const cols = labels.map((label, i) => {
      const seq = accrueIdx + i; // Acc = accrueIdx, Curr = +1, ... Ad5 = +6
      const u = usedBySeq.get(seq); // seq < 1 or missing => 0 used
      let nights = Math.max(0, 7 - (u?.nightsUsed ?? 0));
      let weekend = Math.max(0, 1 - (u?.weekendUsed ?? 0));
      // Expiry zeroing (SP): Current (offset 0) .. Ad5 (offset 5) become 0 once the
      // agreement expires on/before today + offset years. Accrue (offset -1) is NEVER
      // zeroed: unused nights carry forward 1 year and are forfeited only after the next
      // anniversary, so last year's accrued balance stays claimable post-expiry.
      const offset = i - 1;
      if (offset >= 0 && expiry <= addYears(today, offset)) {
        nights = 0;
        weekend = 0;
      }
      // Header year = the calendar year the membership period begins (agmtYear + seq - 1).
      // For anniversary-passed agreements this equals the current-year window; for agreements
      // whose anniversary is still ahead this year it is one lower (e.g. 75018: Curr = 2025).
      return { label, year: agmtYear + seq - 1, nights, weekend };
    });
    // SP: weekend follows nights for Accrue + Current only (nights 0 => weekend 0).
    if (cols[0].nights === 0) cols[0].weekend = 0;
    if (cols[1].nights === 0) cols[1].weekend = 0;

    // Forfeited nights (SP cal_ent): sum of the un-utilized balance (7 - nightsUsed) for every
    // membership year OLDER than the Accrue year. Only Accrue + Current + advance years remain
    // claimable; anything before Accrue is lost. Uses nightsUsed only (no actualNights needed).
    // Upper bound clamped at termYears so a long-expired agreement's non-existent post-term years
    // (which have no rows => would each add a phantom 7) are not counted.
    let forfeitedNights = 0;
    const forfLast = Math.min(accrueIdx - 1, agreement.termYears);
    for (let seq = 1; seq <= forfLast; seq++) {
      forfeitedNights += Math.max(0, 7 - (usedBySeq.get(seq)?.nightsUsed ?? 0));
    }

    // Used <year> (SP: curr_used_nights) = actual nights physically taken in the current
    // membership year (Curr = seq accrueIdx + 1); its header year is the Curr column's year.
    const currActual = usedBySeq.get(accrueIdx + 1)?.actualNights ?? 0;
    const usedNights = currActual;
    const usedYear = cols[1].year;

    // Usable nights (SP): min(14 - actual_nights[curr], accBal + currBal + adv1Bal). The 14 is
    // the 2-year annual cap (current 7 + one accrued/advance 7); clamped >= 0 for over-bookings.
    const usableNights = Math.max(
      0,
      Math.min(14 - currActual, cols[0].nights + cols[1].nights + cols[2].nights),
    );

    entitlementBalance = { columns: cols, forfeitedNights, usableNights, usedNights, usedYear };
  }

  // CP Entitlement Balance (coCode 02 only): point balances per membership year, ported
  // from the Informix SP get_entitlement_balance_CP. Unlike LHC, CP stores the balance
  // points directly (balPts) per anniversary-dated year row, so this is a lookup not a
  // subtraction. ref = the row with the greatest useYear <= today (current membership
  // year); Accrued = prior year balance capped at half the annual entitlement; Adv1..5 =
  // future year balances (blank when the row is missing, e.g. after expiry). Matched by
  // natural key (coCode + membershipNo + agreementNo). Hidden for TM.
  let cpEntitlementBalance:
    | { columns: { label: string; year: number; bal: number | null }[]; forfeitedPts: number }
    | null = null;
  if (agreement.coCode === '02' && agreement.acctClassify !== 'TM') {
    const rows = await prisma.cpBookingEntitlement.findMany({
      where: {
        coCode: '02',
        membershipNo: agreement.membershipNo,
        agreementNo: agreement.agreementNo,
      },
      select: { useYear: true, totalPts: true, acrusePts: true, balPts: true },
    });
    if (rows.length) {
      // Key by anniversary calendar year (all rows share the same month/day anniversary).
      const byYear = new Map<number, { totalPts: number; acrusePts: number; balPts: number }>();
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let refYear: number | null = null;
      for (const r of rows) {
        const y = r.useYear.getFullYear();
        byYear.set(y, { totalPts: r.totalPts, acrusePts: r.acrusePts, balPts: r.balPts });
        // ref = greatest useYear <= today (date-only, timezone-normalized like LHC above).
        const uy = new Date(r.useYear.getFullYear(), r.useYear.getMonth(), r.useYear.getDate());
        if (uy <= today && (refYear === null || y > refYear)) refYear = y;
      }
      if (refYear !== null) {
        const ref = byYear.get(refYear)!;
        const maxAccrue = Math.floor(ref.totalPts / 2); // SP: max accrue = half the annual entitlement
        // Accrued = prior year balance, capped so prior.acrusePts + accrued <= maxAccrue.
        const prior = byYear.get(refYear - 1);
        let accrued: number | null = null;
        if (prior) {
          accrued = prior.balPts;
          if (prior.acrusePts + accrued > maxAccrue) accrued = maxAccrue - prior.acrusePts;
        }
        // Forfeited points (SP get_entitlement_balance_CP): sum of balPts for every year row up
        // to and including the accrue year (refYear - 1), minus the still-claimable accrued value.
        // Anything not carried forward as Accrue from those older years is lost. Clamped >= 0.
        let forfeitedPts = 0;
        for (const [y, v] of byYear) {
          if (y <= refYear - 1) forfeitedPts += v.balPts;
        }
        forfeitedPts = Math.max(0, forfeitedPts - (accrued ?? 0));

        const labels = ['Acc', 'Curr', 'Ad1', 'Ad2', 'Ad3', 'Ad4', 'Ad5'];
        const columns = labels.map((label, i) => {
          const year = refYear! + (i - 1); // Acc = ref-1, Curr = ref, Ad1..Ad5 = ref+1..+5
          // Accrued is the capped carry-forward; every other column is the raw year balance
          // (blank/null when no source row exists — e.g. years past expiry).
          const bal = i === 0 ? accrued : byYear.has(year) ? byYear.get(year)!.balPts : null;
          return { label, year, bal };
        });
        cpEntitlementBalance = { columns, forfeitedPts };
      }
    }
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

  res.json({ data: { ...agreement, amcSchedule: amcSchedule ?? null, pbsScheme: pbsScheme ?? null, entitlementBalance, cpEntitlementBalance, salespersonName, transferToMemberName, transferFromMemberName, transferToMemberId, transferFromMemberId } });
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
