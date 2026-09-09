import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/rci-week.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

// No 'edit' route exists: a week cannot be modified, only a whole year added or removed.
router.get('/',        requirePermission('RESORT_BOOKING', 'view'),   ctrl.listRciWeeks);
router.get('/years',   requirePermission('RESORT_BOOKING', 'view'),   ctrl.listRciWeekYears);
router.post('/year',   requirePermission('RESORT_BOOKING', 'create'), ctrl.createRciWeekYear);
router.delete('/year', requirePermission('RESORT_BOOKING', 'delete'), ctrl.deleteRciWeekYear);

export default router;
