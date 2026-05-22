import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { prisma } from '../utils/prisma';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/', async (_req, res) => {
  const states = await prisma.state.findMany({ orderBy: { code: 'asc' } });
  res.json({ data: states });
});

export default router;
