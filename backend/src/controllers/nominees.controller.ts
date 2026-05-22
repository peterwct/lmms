import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

const nomineeSchema = z.object({
  nomineeSeq:  z.number().int().min(1).max(2),
  fullName:    z.string().optional().nullable(),
  icOld:       z.string().optional().nullable(),
  icNew:       z.string().optional().nullable(),
  salutation:  z.string().optional().nullable(),
  designation: z.string().optional().nullable(),
  nameCard:    z.string().optional().nullable(),
  telHome:     z.string().optional().nullable(),
  telMobile:   z.string().optional().nullable(),
  add1:        z.string().optional().nullable(),
  add2:        z.string().optional().nullable(),
  add3:        z.string().optional().nullable(),
  cityState:   z.string().optional().nullable(),
  postcode:    z.string().optional().nullable(),
  email:       z.string().email().optional().nullable(),
});

const bodySchema = z.object({
  nominees: z.array(nomineeSchema).min(1).max(2),
});

export async function updateNominees(req: Request, res: Response): Promise<void> {
  const agreementId = req.params.id;
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const agreement = await prisma.agreement.findUnique({ where: { id: agreementId } });
  if (!agreement) { res.status(404).json({ error: 'Agreement not found' }); return; }

  const nominees = await prisma.$transaction(
    parsed.data.nominees.map((n) =>
      prisma.nominee.upsert({
        where: { agreementId_nomineeSeq: { agreementId, nomineeSeq: n.nomineeSeq } },
        update: { ...n },
        create: { agreementId, ...n },
      })
    )
  );

  await writeAudit({ userId: req.user.id, action: `Updated nominees for agreement: ${agreement.agreementNo}`, actionType: 'UPDATE', targetType: 'Agreement', metadata: { agreementId } });
  res.json({ data: nominees });
}
