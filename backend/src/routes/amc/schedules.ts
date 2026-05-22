import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';
import * as ctrl from '../../controllers/amc/schedules.controller';

const router = Router({ mergeParams: true });
router.use(authenticate, requirePasswordChanged);

router.get('/', requirePermission('AMC_BILLING', 'view'), ctrl.listSchedules);
router.get('/:id', requirePermission('AMC_BILLING', 'view'), ctrl.getSchedule);

export default router;
