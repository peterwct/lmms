import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { generateMembersReport } from '../controllers/reports/members.report';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/members', requirePermission('MEMBERS', 'view'), generateMembersReport);

export default router;
