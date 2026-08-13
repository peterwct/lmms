import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

// An LVC code names an exchange programme: LVC-CP (coCode 03/15 <-> 02, our own
// members), LVC-SGI / LVC-CLC (into an external partner's resorts), etc.
const STATUSES = ['A', 'U'] as const;

const lvcCodeSchema = z.object({
  lvcCode: z.string().trim().min(1).max(7),
  // lvc_cocode references ps_company.psc_cocode -> Product.coCode. No hard FK (same
  // rule as ResortUnit.apartmentType) but validated on save; all 23 imported rows match.
  coCode:  z.string().trim().max(2).nullish(),
  lvcName: z.string().trim().min(1).max(40),
  status:  z.enum(STATUSES).default('A'),
});

// coCode must name a real product when supplied. Kept as a lookup rather than a DB
// FK to match how every other coCode column in this codebase is stored.
async function productMissing(coCode: unknown): Promise<boolean> {
  if (typeof coCode !== 'string' || coCode.trim() === '') return false;
  const p = await prisma.product.findUnique({ where: { coCode: coCode.trim() } });
  return !p;
}
// incoming/outgoing/faxBatch are deliberately absent -- they are running counters
// owned by the exchange process, never written through this CRUD.

// empty string -> null so cleared form fields null out the column
const clean = (data: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === '' ? null : v]));

export async function listLvcCodes(req: Request, res: Response): Promise<void> {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const codes = await prisma.lvcCode.findMany({
    where: q
      ? {
          OR: [
            { lvcCode: { contains: q, mode: 'insensitive' } },
            { lvcName: { contains: q, mode: 'insensitive' } },
            { coCode:  { contains: q, mode: 'insensitive' } },
          ],
        }
      : undefined,
    // Active first, then Inactive (A < U), each alphabetical -- mirrors listResorts
    orderBy: [{ status: 'asc' }, { lvcCode: 'asc' }],
  });
  res.json({ data: codes });
}

export async function createLvcCode(req: Request, res: Response): Promise<void> {
  const parsed = lvcCodeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }
  if (await productMissing(parsed.data.coCode)) {
    res.status(400).json({ error: `Product ${parsed.data.coCode} does not exist` }); return;
  }

  try {
    // counters take their DB default of 0
    const lvc = await prisma.lvcCode.create({
      data: { id: randomUUID(), ...clean(parsed.data), updatedAt: new Date() } as never,
    });
    await writeAudit({ userId: req.user.id, action: `Created LVC code: ${lvc.lvcCode} ${lvc.lvcName}`, actionType: 'CREATE', targetType: 'LvcCode' });
    res.status(201).json({ data: lvc });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'LVC code already exists' }); }
    else { throw e; }
  }
}

export async function updateLvcCode(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  // lvcCode is fixed after creation -- rename = delete + re-add
  const parsed = lvcCodeSchema.omit({ lvcCode: true }).partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }
  if (await productMissing(parsed.data.coCode)) {
    res.status(400).json({ error: `Product ${parsed.data.coCode} does not exist` }); return;
  }

  try {
    const lvc = await prisma.lvcCode.update({
      where: { id },
      data: { ...clean(parsed.data), updatedAt: new Date() } as never,
    });
    await writeAudit({ userId: req.user.id, action: `Updated LVC code: ${lvc.lvcCode} ${lvc.lvcName}`, actionType: 'UPDATE', targetType: 'LvcCode' });
    res.json({ data: lvc });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'LVC code not found' }); }
    else { throw e; }
  }
}

export async function toggleLvcStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const existing = await prisma.lvcCode.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'LVC code not found' }); return; }

  const lvc = await prisma.lvcCode.update({
    where: { id },
    data: { status: existing.status === 'A' ? 'U' : 'A', updatedAt: new Date() },
  });
  await writeAudit({ userId: req.user.id, action: `${lvc.status === 'A' ? 'Activated' : 'Deactivated'} LVC code: ${lvc.lvcCode} ${lvc.lvcName}`, actionType: 'UPDATE', targetType: 'LvcCode' });
  res.json({ data: lvc });
}

export async function deleteLvcCode(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  // No usage guard -- nothing references LvcCode yet. Add one here when the
  // booking/exchange module starts storing lvcCode on its records.
  try {
    const lvc = await prisma.lvcCode.delete({ where: { id } });
    await writeAudit({ userId: req.user.id, action: `Deleted LVC code: ${lvc.lvcCode} ${lvc.lvcName}`, actionType: 'DELETE', targetType: 'LvcCode' });
    res.json({ message: 'LVC code deleted' });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'LVC code not found' }); }
    else { throw e; }
  }
}
