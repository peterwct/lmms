import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

// RCI (Resort Condominiums International) enrolment register - RCI function 1.
//
// One row per ENROLMENT, not per agreement: an agreement can hold several rows (a
// lapsed 1704-* enrolment plus a newer PENDING one, for example), so there is no
// unique constraint on coCode+membershipNo+agreementNo - 91 such groups exist in the
// migrated data. serialNo (Informix re_serial_no) is the unique identifier.
//
// renewalDate (re_act_date) and expiryDate are INFORMATION ONLY - members renew with
// RCI directly, so nothing in this system acts on or validates them.

const RCI_STATUSES = ['A', 'C', 'M', 'T'] as const;

// Business dates are stored at UTC midnight (project-wide convention).
const dateField = z.preprocess(
  v => (v === '' || v === null || v === undefined ? null : v),
  z.coerce.date().nullish(),
);

// Same coercion, but blank/null is NOT accepted - for the create-only mandatory dates.
// z.coerce.date() alone would turn '' into an Invalid Date rather than failing.
const requiredDateField = z.preprocess(
  v => (v === '' || v === null ? undefined : v),
  z.coerce.date(),
);

// The permissive base schema, used as-is by the UPDATE path. Only the agreement key is
// required here: 17,915 rows were migrated from Informix with gaps - no renewal/expiry
// date on ~19%, no telNo1 on 15%, no rciFees on 58% - and a small correction to one of
// them (a status change, a resort fix) must not be blocked behind back-filling a date
// nobody has. The ADD path tightens this; see rciEnrolmentCreateSchema below.
//
// totInterval (re_tot_interval) is deliberately ABSENT: it is migrated for provenance but
// appears on no form, so CRUD can never write it and new rows take the Prisma default of 1.
// Same treatment as the LvcCode counters and RciBulkBank.bankStatus.
const rciEnrolmentSchema = z.object({
  coCode:        z.string().trim().min(1).max(2),
  membershipNo:  z.string().trim().min(1).max(19),
  agreementNo:   z.string().trim().min(1).max(8),
  rciNo:         z.string().trim().max(10).nullish(),
  renewalDate:   dateField,
  expiryDate:    dateField,
  rciFees:       z.number().min(0).max(999999.99).nullish(),
  resortCode:    z.string().trim().max(8).nullish(),
  firstName1:    z.string().trim().max(10).nullish(),
  lastName1:     z.string().trim().max(20).nullish(),
  name1:         z.string().trim().max(40).nullish(),
  firstName2:    z.string().trim().max(10).nullish(),
  lastName2:     z.string().trim().max(20).nullish(),
  mailAdd1:      z.string().trim().max(30).nullish(),
  mailAdd2:      z.string().trim().max(30).nullish(),
  mailAdd3:      z.string().trim().max(30).nullish(),
  mailCityState: z.string().trim().max(30).nullish(),
  mailPostcode:  z.string().trim().max(7).nullish(),
  malaysia:      z.enum(['Y', 'N']).nullish(),
  telNo1:        z.string().trim().max(18).nullish(),
  telNo2:        z.string().trim().max(18).nullish(),
  coOwner:       z.string().trim().max(40).nullish(),
  rciStatus:     z.enum(RCI_STATUSES).nullish(),
});

// Named reqStr, not req: every handler in this file takes a `req: Request` parameter.
const reqStr = (max: number) => z.string().trim().min(1).max(max);

// ADD-only rules. A new enrolment must be complete, so six fields the base schema leaves
// nullish become required. Optional on add as well as edit: rciFees (not always known at
// enrolment time - null on 58% of the migrated rows), first/last name 2, co-owner, the whole
// mailing-address block and both phone numbers.
//
// firstName1/lastName1 were REMOVED from this set on 2026-09-09 (business decision) along with
// the first-space split that prefilled them. Only name1 is prefilled now, and name1 is the name
// that identifies the enrolment, so making staff key it into three boxes bought nothing.
const rciEnrolmentCreateSchema = rciEnrolmentSchema.extend({
  rciNo:       reqStr(10),
  rciStatus:   z.enum(RCI_STATUSES),
  resortCode:  reqStr(8),
  renewalDate: requiredDateField,
  expiryDate:  requiredDateField,
  name1:       reqStr(40),
});

// empty string -> null so cleared form fields null out the column
const clean = (data: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === '' ? null : v]));

// The agreement must exist. Matched on the full natural key (coCode + membershipNo +
// agreementNo) rather than the FK direction - agreementNo alone is duplicated across
// TT/TF transfer pairs. Nothing is stored from the lookup; it only validates the key
// and supplies the member name for display.
async function findAgreement(coCode: string, membershipNo: string, agreementNo: string) {
  return prisma.agreement.findFirst({
    where: { coCode, membershipNo, agreementNo },
    select: { id: true, acctClassify: true, member: { select: { fullName: true } } },
  });
}

// An RCI number belongs to ONE membership (business rule 2026-09-09). The same rciNo may be
// reused freely across that membership's own agreements - 34 numbers legitimately are, e.g.
// 1704-02762 on 7 rows of one membership - but it must not appear under a different one.
//
// PENDING is EXEMPT: it is the sanctioned placeholder for "enrolled, number not yet issued"
// and sits on 3,335 rows across 3,255 memberships, so treating it as a real number would
// block almost every new enrolment. Matched case-insensitively so 'pending' cannot slip past.
//
// SAVE-TIME rule, deliberately not a DB constraint: 58 migrated numbers already span more
// than one membership (52 across 2, 6 across 3 - including legacy typos like `704-00853 and
// the 0000-00000 placeholder), and a unique index would make the Informix data unloadable.
// Those rows stay readable and editable; see updateRciEnrolment for why an edit that leaves
// rciNo alone is never blocked.
const RCI_NO_EXEMPT = new Set(['PENDING']);

async function rciNoOwnedByAnotherMembership(
  rciNo: string | null | undefined,
  membershipNo: string,
  excludeId?: string,
) {
  const v = (rciNo ?? '').trim();
  if (!v || RCI_NO_EXEMPT.has(v.toUpperCase())) return null;
  return prisma.rciEnrolment.findFirst({
    where: {
      rciNo: v,
      membershipNo: { not: membershipNo },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: { serialNo: 'asc' },
    select: { membershipNo: true, agreementNo: true, serialNo: true },
  });
}

// The CURRENT enrolment for an agreement, plus how many it has in total.
//
// An agreement can hold several rows - typically a lapsed 1704-* enrolment alongside a
// newer PENDING one - so "the" enrolment has to be chosen: the ACTIVE row wins, falling
// back to the highest serialNo. Only 2 agreement keys in the migrated data carry more
// than one active row, so this is deterministic in practice.
//
// Matched on the full natural key (coCode + membershipNo + agreementNo), never the FK
// direction - agreementNo alone is duplicated across TT/TF transfer pairs. Covered by
// the @@index([coCode, membershipNo, agreementNo]) on RciEnrolment.
//
// This is what Agreement Detail's read-only RCI card renders; RciEnrolment is the single
// source of truth for RCI data, and RCI fn 1 is the only place it can be edited.
export async function currentEnrolment(coCode: string, membershipNo: string, agreementNo: string) {
  const rows = await prisma.rciEnrolment.findMany({ where: { coCode, membershipNo, agreementNo } });
  if (!rows.length) return { enrolment: null, count: 0 };
  const rank = (r: { rciStatus: string | null }) => (r.rciStatus === 'A' ? 0 : 1);
  rows.sort((a, b) => rank(a) - rank(b) || b.serialNo - a.serialNo);
  return { enrolment: rows[0], count: rows.length };
}

export async function listRciEnrolments(req: Request, res: Response): Promise<void> {
  const q         = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const coCode    = typeof req.query.coCode === 'string' ? req.query.coCode.trim() : '';
  const rciStatus = typeof req.query.rciStatus === 'string' ? req.query.rciStatus.trim() : '';
  const page      = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const pageSize  = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize), 10) || 50));

  const where = {
    ...(coCode ? { coCode } : {}),
    ...(rciStatus ? { rciStatus } : {}),
    ...(q
      ? {
          OR: [
            { membershipNo: { contains: q, mode: 'insensitive' as const } },
            { agreementNo:  { contains: q, mode: 'insensitive' as const } },
            { rciNo:        { contains: q, mode: 'insensitive' as const } },
            { name1:        { contains: q, mode: 'insensitive' as const } },
            { coOwner:      { contains: q, mode: 'insensitive' as const } },
            { resortCode:   { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.rciEnrolment.count({ where }),
    prisma.rciEnrolment.findMany({
      where,
      orderBy: [{ membershipNo: 'asc' }, { agreementNo: 'asc' }, { serialNo: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  // Resolve the member and agreement each row points at, so the list can link back to
  // their detail pages. RciEnrolment has no FK - it stores the natural key - so both are
  // looked up per page (<=200 rows) and returned as resolved-on-read fields, never
  // stored, the same way getRciEnrolment returns memberName/acctClassify.
  //
  // The two lookups are deliberately independent: 6 migrated rows resolve to no agreement
  // (legacy coCode 12 / membership 00000-KL-M-0000/M/I), and the membership link should
  // still work for them if the member exists. Agreement is matched on the FULL natural
  // key - agreementNo alone is duplicated across TT/TF transfer pairs.
  const [members, agreements] = await Promise.all([
    rows.length
      ? prisma.member.findMany({
          where: { membershipNo: { in: [...new Set(rows.map(r => r.membershipNo))] } },
          select: { id: true, membershipNo: true },
        })
      : [],
    rows.length
      ? prisma.agreement.findMany({
          where: {
            OR: rows.map(r => ({
              coCode: r.coCode, membershipNo: r.membershipNo, agreementNo: r.agreementNo,
            })),
          },
          select: { id: true, coCode: true, membershipNo: true, agreementNo: true },
        })
      : [],
  ]);
  const memberId = new Map(members.map(m => [m.membershipNo, m.id]));
  const agreementId = new Map(
    agreements.map(a => [`${a.coCode}|${a.membershipNo}|${a.agreementNo}`, a.id]),
  );

  const data = rows.map(r => ({
    ...r,
    memberId: memberId.get(r.membershipNo) ?? null,
    agreementId: agreementId.get(`${r.coCode}|${r.membershipNo}|${r.agreementNo}`) ?? null,
  }));

  res.json({ data, total, page, pageSize });
}

export async function getRciEnrolment(req: Request, res: Response): Promise<void> {
  const row = await prisma.rciEnrolment.findUnique({ where: { id: req.params.id } });
  if (!row) { res.status(404).json({ error: 'RCI enrolment not found' }); return; }

  // Resolved on read by natural key, never stored - see findAgreement().
  const agmt = await findAgreement(row.coCode, row.membershipNo, row.agreementNo);
  res.json({
    data: {
      ...row,
      memberName:   agmt?.member?.fullName ?? null,
      acctClassify: agmt?.acctClassify ?? null,
    },
  });
}

export async function createRciEnrolment(req: Request, res: Response): Promise<void> {
  const parsed = rciEnrolmentCreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }
  const d = parsed.data;

  const agmt = await findAgreement(d.coCode, d.membershipNo, d.agreementNo);
  if (!agmt) {
    res.status(400).json({ error: `No agreement ${d.agreementNo} for membership ${d.membershipNo} on product ${d.coCode}` });
    return;
  }

  // One enrolment per agreement (business rule 2026-09-08). Matched on the FULL natural
  // key - agreementNo alone is duplicated across TT/TF transfer pairs.
  //
  // NOTE this is a LOOKUP, not a constraint, and it cannot become one: the key is
  // deliberately NOT unique (90 migrated groups hold 2-4 rows, and a unique index would make
  // the Informix data unloadable). Read BEFORE the transaction opens - it is a precondition,
  // not part of the serialNo allocation.
  //
  // The UPDATE path is untouched: the agreement key is immutable after create, so an edit
  // can never introduce a duplicate, and the 90 legacy groups must stay editable.
  const existing = await prisma.rciEnrolment.findFirst({
    where: { coCode: d.coCode, membershipNo: d.membershipNo, agreementNo: d.agreementNo },
    orderBy: { serialNo: 'desc' },
    select: { serialNo: true, rciNo: true },
  });
  if (existing) {
    res.status(409).json({
      error: `Agreement ${d.agreementNo} (membership ${d.membershipNo}) is already enrolled `
           + `- RCI no ${existing.rciNo ?? '-'}, serial ${existing.serialNo}. `
           + `Edit that enrolment instead of adding another.`,
    });
    return;
  }

  // An RCI number belongs to one membership - see rciNoOwnedByAnotherMembership().
  const rciClash = await rciNoOwnedByAnotherMembership(d.rciNo, d.membershipNo);
  if (rciClash) {
    res.status(409).json({
      error: `RCI no ${(d.rciNo ?? '').trim()} already belongs to membership ${rciClash.membershipNo} `
           + `(agreement ${rciClash.agreementNo}, serial ${rciClash.serialNo}). `
           + `The same RCI no may only be reused across one membership's own agreements.`,
    });
    return;
  }

  try {
    // serialNo continues the Informix `serial` sequence. Allocated inside the
    // transaction; the unique index is the backstop if two creates ever race.
    const row = await prisma.$transaction(async tx => {
      const agg = await tx.rciEnrolment.aggregate({ _max: { serialNo: true } });
      const serialNo = (agg._max.serialNo ?? 0) + 1;
      return tx.rciEnrolment.create({
        data: { id: randomUUID(), serialNo, ...clean(d), updatedAt: new Date() } as never,
      });
    });
    await writeAudit({
      userId: req.user.id,
      action: `Created RCI enrolment: ${row.membershipNo} / ${row.agreementNo} (RCI ${row.rciNo ?? '-'})`,
      actionType: 'CREATE', targetType: 'RciEnrolment',
    });
    res.status(201).json({ data: row });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') {
      res.status(409).json({ error: 'Serial number already in use - please retry' });
    } else { throw e; }
  }
}

export async function updateRciEnrolment(req: Request, res: Response): Promise<void> {
  // The agreement this enrolment belongs to is fixed after creation - move = delete
  // + re-add, the same rule as ResortUnit.resortCode.
  const parsed = rciEnrolmentSchema
    .omit({ coCode: true, membershipNo: true, agreementNo: true })
    .partial()
    .safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  // The row is loaded first because the payload carries no membershipNo (the agreement key is
  // immutable) and the RCI-number check needs it.
  const current = await prisma.rciEnrolment.findUnique({
    where: { id: req.params.id },
    select: { membershipNo: true, rciNo: true },
  });
  if (!current) { res.status(404).json({ error: 'RCI enrolment not found' }); return; }

  // Only checked when rciNo is actually CHANGING. 58 migrated numbers already span more than
  // one membership, and re-running the guard on every edit would block an unrelated correction
  // (a date, a status) to a row nobody broke. Changing the number TO one owned elsewhere is
  // still refused.
  const nextRciNo = parsed.data.rciNo;
  if (nextRciNo !== undefined && (nextRciNo ?? '').trim() !== (current.rciNo ?? '').trim()) {
    const clash = await rciNoOwnedByAnotherMembership(nextRciNo, current.membershipNo, req.params.id);
    if (clash) {
      res.status(409).json({
        error: `RCI no ${(nextRciNo ?? '').trim()} already belongs to membership ${clash.membershipNo} `
             + `(agreement ${clash.agreementNo}, serial ${clash.serialNo}). `
             + `The same RCI no may only be reused across one membership's own agreements.`,
      });
      return;
    }
  }

  try {
    const row = await prisma.rciEnrolment.update({
      where: { id: req.params.id },
      data: { ...clean(parsed.data), updatedAt: new Date() } as never,
    });
    await writeAudit({
      userId: req.user.id,
      action: `Updated RCI enrolment: ${row.membershipNo} / ${row.agreementNo} (RCI ${row.rciNo ?? '-'})`,
      actionType: 'UPDATE', targetType: 'RciEnrolment',
    });
    res.json({ data: row });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'RCI enrolment not found' }); }
    else { throw e; }
  }
}

export async function deleteRciEnrolment(req: Request, res: Response): Promise<void> {
  // No usage guard - nothing references RciEnrolment yet. Add one here when RCI
  // Interval (fn 2) starts pointing at an enrolment.
  try {
    const row = await prisma.rciEnrolment.delete({ where: { id: req.params.id } });
    await writeAudit({
      userId: req.user.id,
      action: `Deleted RCI enrolment: ${row.membershipNo} / ${row.agreementNo} (RCI ${row.rciNo ?? '-'})`,
      actionType: 'DELETE', targetType: 'RciEnrolment',
    });
    res.json({ message: 'RCI enrolment deleted' });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'RCI enrolment not found' }); }
    else { throw e; }
  }
}

// Agreement picker for the add form: staff search by membership no, member name or
// agreement no, pick a result, and the form fills the key and the enrolled name from it.
// It replaces the old hand-keyed key + lookupAgreement verify, which could not tell staff
// that an agreement was already enrolled.
//
// It lives HERE, under /rci-enrolments + RESORTS_SETUP view, rather than reusing
// /api/agreements: that route needs the AGREEMENTS permission, which the departments who
// maintain RCI do not necessarily hold. Same reason Member Enquiry has its own
// /api/members/enquiry. See "Cross-Module API Permissions" in CLAUDE.md.
const SEARCH_MIN = 2;

export async function searchAgreements(req: Request, res: Response): Promise<void> {
  const q      = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const coCode = typeof req.query.coCode === 'string' ? req.query.coCode.trim() : '';
  const limit  = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 20));

  // Too short is an EMPTY 200, not a 400 - the form fetches as the user types and a short
  // term is a normal intermediate state, not a client error.
  if (q.length < SEARCH_MIN) { res.json({ data: [], total: 0, limit }); return; }

  const where = {
    ...(coCode ? { coCode } : {}),
    OR: [
      { agreementNo:  { contains: q, mode: 'insensitive' as const } },
      { membershipNo: { contains: q, mode: 'insensitive' as const } },
      { member: { fullName: { contains: q, mode: 'insensitive' as const } } },
    ],
  };

  const [total, rows] = await Promise.all([
    prisma.agreement.count({ where }),
    prisma.agreement.findMany({
      where,
      // AgreementStatus is declared NA, SU, PT, TM, so 'asc' puts live agreements first.
      orderBy: [{ acctClassify: 'asc' }, { membershipNo: 'asc' }, { agreementNo: 'asc' }],
      take: limit,
      select: {
        id: true, coCode: true, membershipNo: true, agreementNo: true, acctClassify: true,
        member: { select: { fullName: true, memberType: true } },
        // Nominees hang off Agreement, not Member. Nominee 1 is the person actually enrolled
        // with RCI when the member is a company - 1,935 of the 1,945 corporate agreements
        // have one with a name.
        nominees: { where: { nomineeSeq: 1 }, select: { fullName: true }, take: 1 },
      },
    }),
  ]);

  // Which of these are already enrolled, for the WHOLE page in one query - never a lookup
  // per row. Matched on the FULL natural key, since RciEnrolment has no FK and agreementNo
  // alone is duplicated across TT/TF transfer pairs. groupBy gives one row per key plus the
  // highest serialNo, which the disabled row uses to name the record to edit instead.
  const keys = rows.map(a => ({
    coCode: a.coCode, membershipNo: a.membershipNo, agreementNo: a.agreementNo,
  }));
  const enrolments = keys.length
    ? await prisma.rciEnrolment.groupBy({
        by: ['coCode', 'membershipNo', 'agreementNo'],
        where: { OR: keys },
        _count: { _all: true },
        _max: { serialNo: true },
      })
    : [];
  const keyOf = (r: { coCode: string; membershipNo: string; agreementNo: string }) =>
    `${r.coCode}|${r.membershipNo}|${r.agreementNo}`;
  const byKey = new Map(enrolments.map(e => [keyOf(e), e]));

  const data = rows.map(a => {
    const hit = byKey.get(keyOf(a));
    const nominee1Name = a.nominees[0]?.fullName ?? null;
    // The name the form fills into name1: the member for an INDIVIDUAL, nominee 1 for a
    // CORPORATE member (a company name is not a person RCI can enrol). Truncated to name1's
    // 40-char column limit HERE, next to the zod .max(40) that would otherwise 400 a long
    // member name straight back at the user.
    const suggested = a.member.memberType === 'CORPORATE' ? nominee1Name : a.member.fullName;
    return {
      agreementId: a.id,
      coCode: a.coCode, membershipNo: a.membershipNo, agreementNo: a.agreementNo,
      acctClassify: a.acctClassify,
      memberName: a.member.fullName,
      memberType: a.member.memberType,
      nominee1Name,
      suggestedName1: suggested ? suggested.trim().slice(0, 40) : null,
      // Returned FLAGGED, not filtered out: hiding an enrolled agreement would read as "no
      // such agreement" and send staff back to re-search. The form disables the row.
      enrolled: !!hit,
      enrolmentCount: hit?._count._all ?? 0,
      enrolmentSerialNo: hit?._max.serialNo ?? null,
    };
  });

  res.json({ data, total, limit });
}
