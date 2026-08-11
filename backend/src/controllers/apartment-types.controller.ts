import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

// lockType: LM=Master Unit, LS=Split Unit, LN=Normal Unit.
// LM/LS only apply to lock-on/lock-off resorts (Resort.lockOnOff='Y').
const LOCK_TYPES = ['LM', 'LS', 'LN'] as const;

const apartmentTypeSchema = z.object({
  resortCode:    z.string().trim().min(1).max(8),
  apartmentType: z.string().trim().min(1).max(10),
  description:   z.string().trim().max(40).nullish(),
  lockType:      z.enum(LOCK_TYPES).default('LN'),
});

// empty string -> null so cleared form fields null out the column
const clean = (data: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === '' ? null : v]));

const resortSelect = { select: { shortName: true, resortName: true, lockOnOff: true, coCode: true } };

export async function listApartmentTypes(req: Request, res: Response): Promise<void> {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  // Active resorts only (business rule, 2026-08-10). apt_category.txt carries 487 types
  // across 320 resorts, but only 13 resorts are Active -- the rest are retired legacy and
  // partner codes that would bury the working set. This mirrors, for the list itself, the
  // active-only rule the resort pickers already follow (see useActiveResorts).
  // Rows on an inactive resort are hidden, not deleted: they still back the season-points
  // grandfathering and reappear if the resort is reactivated.
  const types = await prisma.apartmentType.findMany({
    where: {
      resort: { status: 'A' },
      ...(q
        ? {
            OR: [
              { resortCode:    { contains: q, mode: 'insensitive' } },
              { apartmentType: { contains: q, mode: 'insensitive' } },
              { description:   { contains: q, mode: 'insensitive' } },
              { resort: { resortName: { contains: q, mode: 'insensitive' } } },
              { resort: { shortName:  { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    include: { resort: resortSelect },
    orderBy: [{ resortCode: 'asc' }, { apartmentType: 'asc' }],
  });
  res.json({ data: types });
}

export async function createApartmentType(req: Request, res: Response): Promise<void> {
  const parsed = apartmentTypeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const resort = await prisma.resort.findUnique({ where: { resortCode: parsed.data.resortCode } });
  if (!resort) { res.status(404).json({ error: 'Resort not found' }); return; }
  if (resort.lockOnOff !== 'Y' && parsed.data.lockType !== 'LN') {
    res.status(400).json({ error: 'Lock type is only editable for lock-on/lock-off resorts' });
    return;
  }

  try {
    const at = await prisma.apartmentType.create({
      data: { id: randomUUID(), resortId: resort.id, ...clean(parsed.data), updatedAt: new Date() } as never,
      include: { resort: resortSelect },
    });
    await writeAudit({ userId: req.user.id, action: `Created apartment type: ${at.resortCode} ${at.apartmentType}`, actionType: 'CREATE', targetType: 'ApartmentType' });
    res.status(201).json({ data: at });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'Apartment type already exists for this resort' }); }
    else { throw e; }
  }
}

export async function updateApartmentType(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  // resortCode is fixed after creation — move a type by delete + re-add
  const parsed = apartmentTypeSchema.omit({ resortCode: true }).partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const existing = await prisma.apartmentType.findUnique({ where: { id }, include: { resort: resortSelect } });
  if (!existing) { res.status(404).json({ error: 'Apartment type not found' }); return; }
  const lockType = parsed.data.lockType ?? existing.lockType;
  if (existing.resort.lockOnOff !== 'Y' && lockType !== 'LN') {
    res.status(400).json({ error: 'Lock type is only editable for lock-on/lock-off resorts' });
    return;
  }

  try {
    const at = await prisma.apartmentType.update({
      where: { id },
      data: { ...clean(parsed.data), updatedAt: new Date() } as never,
      include: { resort: resortSelect },
    });
    await writeAudit({ userId: req.user.id, action: `Updated apartment type: ${at.resortCode} ${at.apartmentType}`, actionType: 'UPDATE', targetType: 'ApartmentType' });
    res.json({ data: at });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'Apartment type already exists for this resort' }); }
    else { throw e; }
  }
}

export async function deleteApartmentType(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  try {
    const at = await prisma.apartmentType.delete({ where: { id } });
    await writeAudit({ userId: req.user.id, action: `Deleted apartment type: ${at.resortCode} ${at.apartmentType}`, actionType: 'DELETE', targetType: 'ApartmentType' });
    res.json({ message: 'Apartment type deleted' });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'Apartment type not found' }); }
    else { throw e; }
  }
}
