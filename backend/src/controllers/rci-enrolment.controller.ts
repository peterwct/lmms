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
  totInterval:   z.number().int().min(0).max(99).default(1),
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
  const parsed = rciEnrolmentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }
  const d = parsed.data;

  const agmt = await findAgreement(d.coCode, d.membershipNo, d.agreementNo);
  if (!agmt) {
    res.status(400).json({ error: `No agreement ${d.agreementNo} for membership ${d.membershipNo} on product ${d.coCode}` });
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

// Agreement lookup for the add form: confirms the key and returns the member name so
// staff can verify they are enrolling the right agreement before saving.
export async function lookupAgreement(req: Request, res: Response): Promise<void> {
  const coCode       = typeof req.query.coCode === 'string' ? req.query.coCode.trim() : '';
  const membershipNo = typeof req.query.membershipNo === 'string' ? req.query.membershipNo.trim() : '';
  const agreementNo  = typeof req.query.agreementNo === 'string' ? req.query.agreementNo.trim() : '';
  if (!coCode || !membershipNo || !agreementNo) {
    res.status(400).json({ error: 'coCode, membershipNo and agreementNo are all required' });
    return;
  }

  const agmt = await findAgreement(coCode, membershipNo, agreementNo);
  if (!agmt) { res.status(404).json({ error: 'Agreement not found' }); return; }
  res.json({ data: { memberName: agmt.member?.fullName ?? null, acctClassify: agmt.acctClassify } });
}
