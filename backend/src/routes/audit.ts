import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requireIT } from '../middleware/permissions';
import * as ctrl from '../controllers/audit.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged, requireIT);

router.get('/', ctrl.listAuditLogs);

export default router;
