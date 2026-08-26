import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

const resortUnitSchema = z.object({
  resortCode:    z.string().trim().min(1).max(8),
  unitNo:        z.string().trim().min(1).max(10),
  apartmentType: z.string().trim().min(1).max(10),
  occupancy:     z.number().int().min(1).max(20).nullish(),
  rciReserved:   z.enum(['Y', 'N']).default('N'),
});

const resortSelect = { select: { shortName: true, resortName: true, coCode: true } };

// The unit's apartment type must be set up for that resort (natural-key check —
// no hard FK: apartment types are renamable/deletable via their own CRUD)
export async function apartmentTypeExists(resortCode: string, apartmentType: string): Promise<boolean> {
  const at = await prisma.apartmentType.findUnique({
    where: { resortCode_apartmentType: { resortCode, apartmentType } },
  });
  return !!at;
}

export async function listResortUnits(req: Request, res: Response): Promise<void> {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize), 10) || 50));

  const where = {
    ...(resortCode ? { resortCode } : {}),
    ...(q
      ? {
          OR: [
            { unitNo:        { contains: q, mode: 'insensitive' as const } },
            { resortCode:    { contains: q, mode: 'insensitive' as const } },
            { apartmentType: { contains: q, mode: 'insensitive' as const } },
            { resort: { resortName: { contains: q, mode: 'insensitive' as const } } },
            { resort: { shortName:  { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const [total, units] = await Promise.all([
    prisma.resortUnit.count({ where }),
    prisma.resortUnit.findMany({
      where,
      include: { resort: resortSelect },
      orderBy: [{ resortCode: 'asc' }, { unitNo: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  res.json({ data: units, total, page, pageSize });
}

export async function createResortUnit(req: Request, res: Response): Promise<void> {
  const parsed = resortUnitSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const resort = await prisma.resort.findUnique({ where: { resortCode: parsed.data.resortCode } });
  if (!resort) { res.status(404).json({ error: 'Resort not found' }); return; }
  if (!(await apartmentTypeExists(parsed.data.resortCode, parsed.data.apartmentType))) {
    res.status(400).json({ error: 'Apartment type not set up for this resort' });
    return;
  }

  try {
    const unit = await prisma.resortUnit.create({
      data: { id: randomUUID(), resortId: resort.id, ...parsed.data, updatedAt: new Date() } as never,
      include: { resort: resortSelect },
    });
    await writeAudit({ userId: req.user.id, action: `Created resort unit: ${unit.resortCode} ${unit.unitNo}`, actionType: 'CREATE', targetType: 'ResortUnit' });
    res.status(201).json({ data: unit });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'Unit already exists for this resort' }); }
    else { throw e; }
  }
}

export async function updateResortUnit(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  // resortCode is fixed after creation — move a unit by delete + re-add
  const parsed = resortUnitSchema.omit({ resortCode: true }).partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const existing = await prisma.resortUnit.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Unit not found' }); return; }
  const apartmentType = parsed.data.apartmentType ?? existing.apartmentType;
  if (!(await apartmentTypeExists(existing.resortCode, apartmentType))) {
    res.status(400).json({ error: 'Apartment type not set up for this resort' });
    return;
  }

  try {
    const unit = await prisma.resortUnit.update({
      where: { id },
      data: { ...parsed.data, updatedAt: new Date() } as never,
      include: { resort: resortSelect },
    });
    await writeAudit({ userId: req.user.id, action: `Updated resort unit: ${unit.resortCode} ${unit.unitNo}`, actionType: 'UPDATE', targetType: 'ResortUnit' });
    res.json({ data: unit });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'Unit already exists for this resort' }); }
    else { throw e; }
  }
}

export async function deleteResortUnit(req: Request, res: Response): Promise<void> {
  const id = req.params.id;

  const unit = await prisma.resortUnit.findUnique({ where: { id } });
  if (!unit) { res.status(404).json({ error: 'Unit not found' }); return; }

  // AptBlock, ResortMaintenance and RciBulkBank carry the unit as a denormalized
  // resortCode + unitNo pair and cascade off Resort, not ResortUnit, so this count is the
  // only thing stopping a delete from orphaning fn 5 availability, fn 6 maintenance and
  // RCI fn 3 bulk bank records. Rows of ANY date count: staff clear those first, and no
  // orphan is ever left behind.
  const where = { resortCode: unit.resortCode, unitNo: unit.unitNo };
  const [blocks, maintenance, bulkBank] = await Promise.all([
    prisma.aptBlock.count({ where }),
    prisma.resortMaintenance.count({ where }),
    prisma.rciBulkBank.count({ where }),
  ]);
  if (blocks + maintenance + bulkBank > 0) {
    res.status(409).json({
      error: `Cannot delete — unit ${unit.unitNo} of ${unit.resortCode} is used by ${blocks} availability record(s), ${maintenance} maintenance record(s), ${bulkBank} RCI bulk bank record(s).`,
    });
    return;
  }

  await prisma.resortUnit.delete({ where: { id } });
  await writeAudit({ userId: req.user.id, action: `Deleted resort unit: ${unit.resortCode} ${unit.unitNo}`, actionType: 'DELETE', targetType: 'ResortUnit' });
  res.json({ message: 'Unit deleted' });
}
