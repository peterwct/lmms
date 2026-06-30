import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { prisma } from '../utils/prisma';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/', async (_req, res) => {
  const reasons = await prisma.cancellationReason.findMany({
    where: { status: 'A' },
    orderBy: { code: 'asc' },
  });
  res.json({ data: reasons });
});

export default router;
