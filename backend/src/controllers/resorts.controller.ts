import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { ResortInfoCategory } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

// Free-form text per category, capped by total length (legacy per-line slot
// limits dropped 2026-07-23 — treated like a remark field)
const INFO_MAX_CHARS = 400;
const INFO_CATEGORIES: Record<ResortInfoCategory, { label: string }> = {
  GETTING_THERE:     { label: 'Getting There' },
  RESORT_FACILITY:   { label: 'Resort Facilities' },
  PLACE_OF_INTEREST: { label: 'Places of Interest' },
  UNIT_AMENITY:      { label: 'Unit Amenities' },
};

// Field sizes follow the Informix resort_mast char() widths
const resortSchema = z.object({
  resortCode:    z.string().trim().min(1).max(8),
  coCode:        z.enum(['03', '15', '02']),
  shortName:     z.string().trim().max(5).nullish(),
  resortName:    z.string().trim().min(1).max(40),
  rciCode:       z.string().trim().max(8).nullish(),
  rciAffiliate:  z.enum(['Y', 'N']).nullish(),
  lockOnOff:     z.enum(['Y', 'N']).nullish(),
  resortMgmt:    z.string().trim().max(25).nullish(),
  contactPerson: z.string().trim().max(30).nullish(),
  add1:          z.string().trim().max(30).nullish(),
  add2:          z.string().trim().max(30).nullish(),
  add3:          z.string().trim().max(30).nullish(),
  city:          z.string().trim().max(30).nullish(),
  state:         z.string().trim().max(30).nullish(),
  country:       z.string().trim().max(30).nullish(),
  telNo:         z.string().trim().max(18).nullish(),
  faxNo:         z.string().trim().max(18).nullish(),
  checkInTime:   z.string().trim().max(20).nullish(),
  checkOutTime:  z.string().trim().max(20).nullish(),
  paymt:         z.enum(['Y', 'N']).nullish(),
});

// empty string -> null so cleared form fields null out the column
const clean = (data: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === '' ? null : v]));

export async function listResorts(req: Request, res: Response): Promise<void> {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const resorts = await prisma.resort.findMany({
    where: q
      ? {
          OR: [
            { resortCode: { contains: q, mode: 'insensitive' } },
            { resortName: { contains: q, mode: 'insensitive' } },
            { shortName:  { contains: q, mode: 'insensitive' } },
          ],
        }
      : undefined,
    // Active first, then resort code. 'A' sorts before 'U' ascending, so a plain asc on
    // status gives Active-then-Inactive (same trick as the AMC schedules acctClassify sort).
    orderBy: [{ status: 'asc' }, { resortCode: 'asc' }],
  });
  res.json({ data: resorts });
}

export async function getResort(req: Request, res: Response): Promise<void> {
  const resort = await prisma.resort.findUnique({
    where: { id: req.params.id },
    include: { infoLines: { orderBy: [{ category: 'asc' }, { seq: 'asc' }] } },
  });
  if (!resort) { res.status(404).json({ error: 'Resort not found' }); return; }

  const { infoLines, ...rest } = resort;
  const info: Record<ResortInfoCategory, string[]> = {
    GETTING_THERE: [], RESORT_FACILITY: [], PLACE_OF_INTEREST: [], UNIT_AMENITY: [],
  };
  for (const line of infoLines) info[line.category].push(line.text);

  res.json({ data: { ...rest, info } });
}

export async function createResort(req: Request, res: Response): Promise<void> {
  const parsed = resortSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  try {
    const resort = await prisma.resort.create({
      data: { id: randomUUID(), ...clean(parsed.data), updatedAt: new Date() } as never,
    });
    await writeAudit({ userId: req.user.id, action: `Created resort: ${resort.resortCode} ${resort.resortName}`, actionType: 'CREATE', targetType: 'Resort' });
    res.status(201).json({ data: resort });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'Resort code already exists' }); }
    else { throw e; }
  }
}

export async function updateResort(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  // resortCode is the natural key — not editable after creation
  const parsed = resortSchema.omit({ resortCode: true }).partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  try {
    const resort = await prisma.resort.update({
      where: { id },
      data: { ...clean(parsed.data), updatedAt: new Date() } as never,
    });
    await writeAudit({ userId: req.user.id, action: `Updated resort: ${resort.resortCode} ${resort.resortName}`, actionType: 'UPDATE', targetType: 'Resort' });
    res.json({ data: resort });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'Resort not found' }); }
    else { throw e; }
  }
}

const infoSchema = z.object({
  category: z.nativeEnum(ResortInfoCategory),
  lines:    z.array(z.string().trim().min(1).max(INFO_MAX_CHARS)),
});

export async function updateResortInfo(req: Request, res: Response): Promise<void> {
  const parsed = infoSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const { category, lines } = parsed.data;
  const { label } = INFO_CATEGORIES[category];
  if (lines.join('\n').length > INFO_MAX_CHARS) {
    res.status(400).json({ error: `${label} allows at most ${INFO_MAX_CHARS} characters in total` });
    return;
  }

  const resort = await prisma.resort.findUnique({ where: { id: req.params.id } });
  if (!resort) { res.status(404).json({ error: 'Resort not found' }); return; }

  await prisma.$transaction(async tx => {
    await tx.resortInfoLine.deleteMany({ where: { resortId: resort.id, category } });
    if (lines.length) {
      await tx.resortInfoLine.createMany({
        data: lines.map((text, i) => ({
          id: randomUUID(), updatedAt: new Date(),
          resortId: resort.id, category, seq: i + 1, text,
        })),
      });
    }
  });

  await writeAudit({ userId: req.user.id, action: `Updated resort info (${label}): ${resort.resortCode} ${resort.resortName}`, actionType: 'UPDATE', targetType: 'ResortInfoLine' });
  res.json({ data: { category, lines } });
}

export async function toggleResortStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const existing = await prisma.resort.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Resort not found' }); return; }

  const resort = await prisma.resort.update({
    where: { id },
    data: { status: existing.status === 'A' ? 'U' : 'A', updatedAt: new Date() },
  });
  await writeAudit({ userId: req.user.id, action: `${resort.status === 'A' ? 'Activated' : 'Deactivated'} resort: ${resort.resortCode} ${resort.resortName}`, actionType: 'UPDATE', targetType: 'Resort' });
  res.json({ data: resort });
}

export async function deleteResort(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  try {
    const resort = await prisma.resort.delete({ where: { id } });
    await writeAudit({ userId: req.user.id, action: `Deleted resort: ${resort.resortCode} ${resort.resortName}`, actionType: 'DELETE', targetType: 'Resort' });
    res.json({ message: 'Resort deleted' });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'Resort not found' }); }
    else { throw e; }
  }
}
