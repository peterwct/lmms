import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../../utils/prisma';
import { writeAudit } from '../../utils/audit';

const lhcRateSchema = z.object({
  coCode:        z.enum(['03', '15']),
  effectiveDate: z.string().datetime(),
  priceCode:     z.string().min(1).max(2),
  currencyCode:  z.string().optional(),
  amcAmount:     z.number().positive(),
  sinkingFund:   z.number().nonnegative(),
  serviceTax:    z.number().nonnegative(),
  totalAmount:   z.number().positive(),
  amountInWords: z.string().optional(),
  rate:          z.number().positive().default(1),
});

const cpRateSchema = z.object({
  effectiveDate:   z.string().datetime(),
  minPoints:       z.number().int().positive(),
  maxPoints:       z.number().int().positive(),
  amcRatePerPoint: z.number().positive(),
  sinkingFundPct:  z.number().nonnegative(),
  gstPct:          z.number().nonnegative(),
  unitPrice:       z.number().optional().nullable(),
  rciPoints:       z.number().int().optional().nullable(),
});

export async function listLhcRates(_req: Request, res: Response): Promise<void> {
  const rates = await prisma.amcPrice.findMany({
    orderBy: [{ coCode: 'asc' }, { effectiveDate: 'desc' }, { priceCode: 'asc' }],
  });
  res.json({ data: rates });
}

export async function createLhcRate(req: Request, res: Response): Promise<void> {
  const parsed = lhcRateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const { effectiveDate, ...rest } = parsed.data;
  try {
    const rate = await prisma.amcPrice.create({ data: { id: randomUUID(), ...rest, effectiveDate: new Date(effectiveDate), updatedAt: new Date() } });
    await writeAudit({ userId: req.user.id, action: `Created LHC rate: coCode=${rate.coCode} priceCode=${rate.priceCode}`, actionType: 'CREATE', targetType: 'AmcPrice' });
    res.status(201).json({ data: rate });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'Rate already exists for this coCode + priceCode + effectiveDate' }); }
    else { throw e; }
  }
}

export async function updateLhcRate(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const parsed = lhcRateSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }
  const { effectiveDate, ...rest } = parsed.data;
  try {
    const rate = await prisma.amcPrice.update({
      where: { id },
      data: { ...rest, ...(effectiveDate ? { effectiveDate: new Date(effectiveDate) } : {}), updatedAt: new Date() },
    });
    await writeAudit({ userId: req.user.id, action: `Updated LHC rate: coCode=${rate.coCode} priceCode=${rate.priceCode}`, actionType: 'UPDATE', targetType: 'AmcPrice' });
    res.json({ data: rate });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'Rate not found' }); }
    else { throw e; }
  }
}

export async function deleteLhcRate(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  try {
    const rate = await prisma.amcPrice.delete({ where: { id } });
    await writeAudit({ userId: req.user.id, action: `Deleted LHC rate: coCode=${rate.coCode} priceCode=${rate.priceCode}`, actionType: 'DELETE', targetType: 'AmcPrice' });
    res.json({ message: 'Rate deleted' });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'Rate not found' }); }
    else { throw e; }
  }
}

export async function toggleLhcRate(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const existing = await prisma.amcPrice.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Rate not found' }); return; }
  const rate = await prisma.amcPrice.update({ where: { id }, data: { isActive: !existing.isActive, updatedAt: new Date() } });
  await writeAudit({ userId: req.user.id, action: `${rate.isActive ? 'Activated' : 'Deactivated'} LHC rate: coCode=${rate.coCode} priceCode=${rate.priceCode}`, actionType: 'UPDATE', targetType: 'AmcPrice' });
  res.json({ data: rate });
}

export async function listCpRates(_req: Request, res: Response): Promise<void> {
  const rates = await prisma.amcPricePoints.findMany({
    orderBy: [{ effectiveDate: 'desc' }, { minPoints: 'asc' }],
  });
  res.json({ data: rates });
}

export async function createCpRate(req: Request, res: Response): Promise<void> {
  const parsed = cpRateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  if (parsed.data.minPoints >= parsed.data.maxPoints) {
    res.status(400).json({ error: 'minPoints must be less than maxPoints' });
    return;
  }

  const { effectiveDate, ...rest } = parsed.data;
  try {
    const rate = await prisma.amcPricePoints.create({ data: { id: randomUUID(), ...rest, coCode: '02', effectiveDate: new Date(effectiveDate), updatedAt: new Date() } });
    await writeAudit({ userId: req.user.id, action: `Created CP rate tier: ${rate.minPoints}-${rate.maxPoints} pts`, actionType: 'CREATE', targetType: 'AmcPricePoints' });
    res.status(201).json({ data: rate });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'Rate tier already exists for this points range + effectiveDate' }); }
    else { throw e; }
  }
}

export async function updateCpRate(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const parsed = cpRateSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }
  const { effectiveDate, ...rest } = parsed.data;
  try {
    const rate = await prisma.amcPricePoints.update({
      where: { id },
      data: { ...rest, ...(effectiveDate ? { effectiveDate: new Date(effectiveDate) } : {}), updatedAt: new Date() },
    });
    await writeAudit({ userId: req.user.id, action: `Updated CP rate tier: ${rate.minPoints}-${rate.maxPoints} pts`, actionType: 'UPDATE', targetType: 'AmcPricePoints' });
    res.json({ data: rate });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'Rate tier not found' }); }
    else { throw e; }
  }
}

export async function deleteCpRate(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  try {
    const rate = await prisma.amcPricePoints.delete({ where: { id } });
    await writeAudit({ userId: req.user.id, action: `Deleted CP rate tier: ${rate.minPoints}-${rate.maxPoints} pts`, actionType: 'DELETE', targetType: 'AmcPricePoints' });
    res.json({ message: 'Rate tier deleted' });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'Rate tier not found' }); }
    else { throw e; }
  }
}

export async function toggleCpRate(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const existing = await prisma.amcPricePoints.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Rate tier not found' }); return; }
  const rate = await prisma.amcPricePoints.update({ where: { id }, data: { isActive: !existing.isActive, updatedAt: new Date() } });
  await writeAudit({ userId: req.user.id, action: `${rate.isActive ? 'Activated' : 'Deactivated'} CP rate tier: ${rate.minPoints}-${rate.maxPoints} pts`, actionType: 'UPDATE', targetType: 'AmcPricePoints' });
  res.json({ data: rate });
}
