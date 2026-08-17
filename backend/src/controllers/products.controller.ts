import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

// entType: W=Week (LHC 03/15 + exchange partners), P=Points (CP 02).
// Kept as a plain String column validated here, not a Prisma enum — adding a
// value later must not require a migration (same reasoning as CpSeasonDate.season).
const ENT_TYPES = ['W', 'P'] as const;

// status: A=Active, U=Inactive. Same A/U convention as LvcCode and Resort, and the
// same reasoning for a plain String over a Prisma enum.
const STATUSES = ['A', 'U'] as const;

const productSchema = z.object({
  coCode:        z.string().trim().min(1).max(2),
  coName:        z.string().trim().min(1).max(40),
  entType:       z.enum(ENT_TYPES),
  status:        z.enum(STATUSES).default('A'),
  add1:          z.string().trim().max(40).nullish(),
  add2:          z.string().trim().max(40).nullish(),
  add3:          z.string().trim().max(40).nullish(),
  telNo:         z.string().trim().max(14).nullish(),
  faxNo:         z.string().trim().max(14).nullish(),
  contactPerson: z.string().trim().max(40).nullish(),
});

// empty string -> null so cleared form fields null out the column
const clean = (data: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === '' ? null : v]));

export async function listProducts(req: Request, res: Response): Promise<void> {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const products = await prisma.product.findMany({
    where: q
      ? {
          OR: [
            { coCode:        { contains: q, mode: 'insensitive' } },
            { coName:        { contains: q, mode: 'insensitive' } },
            { contactPerson: { contains: q, mode: 'insensitive' } },
          ],
        }
      : undefined,
    // Active first, then Inactive (A < U), each by code -- mirrors listLvcCodes.
    // The list itself must keep returning inactive rows: fn 1 is where they are managed.
    orderBy: [{ status: 'asc' }, { coCode: 'asc' }],
  });
  res.json({ data: products });
}

export async function createProduct(req: Request, res: Response): Promise<void> {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  try {
    const p = await prisma.product.create({
      data: { id: randomUUID(), ...clean(parsed.data), updatedAt: new Date() } as never,
    });
    await writeAudit({ userId: req.user.id, action: `Created product: ${p.coCode} ${p.coName}`, actionType: 'CREATE', targetType: 'Product' });
    res.status(201).json({ data: p });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'Product code already exists' }); }
    else { throw e; }
  }
}

export async function updateProduct(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  // coCode is fixed after creation — the whole system keys off it as a plain string
  const parsed = productSchema.omit({ coCode: true }).partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  try {
    const p = await prisma.product.update({
      where: { id },
      data: { ...clean(parsed.data), updatedAt: new Date() } as never,
    });
    await writeAudit({ userId: req.user.id, action: `Updated product: ${p.coCode} ${p.coName}`, actionType: 'UPDATE', targetType: 'Product' });
    res.json({ data: p });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'Product not found' }); }
    else { throw e; }
  }
}

export async function toggleProductStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Product not found' }); return; }

  const p = await prisma.product.update({
    where: { id },
    data: { status: existing.status === 'A' ? 'U' : 'A', updatedAt: new Date() },
  });
  await writeAudit({
    userId: req.user.id,
    action: `${p.status === 'A' ? 'Activated' : 'Deactivated'} product: ${p.coCode} ${p.coName}`,
    actionType: 'UPDATE',
    targetType: 'Product',
  });
  res.json({ data: p });
}

export async function deleteProduct(req: Request, res: Response): Promise<void> {
  const id = req.params.id;

  const p = await prisma.product.findUnique({ where: { id } });
  if (!p) { res.status(404).json({ error: 'Product not found' }); return; }

  // Agreement/AmcSchedule/Resort/LvcCode hold coCode as a plain string with no DB-level
  // FK, so this count is the only thing stopping a delete from orphaning live data.
  const [agreements, schedules, resorts, lvcCodes] = await Promise.all([
    prisma.agreement.count({ where: { coCode: p.coCode } }),
    prisma.amcSchedule.count({ where: { coCode: p.coCode } }),
    prisma.resort.count({ where: { coCode: p.coCode } }),
    prisma.lvcCode.count({ where: { coCode: p.coCode } }),
  ]);
  if (agreements + schedules + resorts + lvcCodes > 0) {
    res.status(409).json({
      error: `Cannot delete — product ${p.coCode} is used by ${agreements} agreement(s), ${schedules} AMC schedule(s), ${resorts} resort(s), ${lvcCodes} LVC code(s).`,
    });
    return;
  }

  await prisma.product.delete({ where: { id } });
  await writeAudit({ userId: req.user.id, action: `Deleted product: ${p.coCode} ${p.coName}`, actionType: 'DELETE', targetType: 'Product' });
  res.json({ message: 'Product deleted' });
}
