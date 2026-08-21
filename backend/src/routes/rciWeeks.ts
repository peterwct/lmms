import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/rci-week.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

// No 'edit' route exists: a week cannot be modified, only a whole year added or removed.
router.get('/',        requirePermission('RESORTS_SETUP', 'view'),   ctrl.listRciWeeks);
router.get('/years',   requirePermission('RESORTS_SETUP', 'view'),   ctrl.listRciWeekYears);
router.post('/year',   requirePermission('RESORTS_SETUP', 'create'), ctrl.createRciWeekYear);
router.delete('/year', requirePermission('RESORTS_SETUP', 'delete'), ctrl.deleteRciWeekYear);

export default router;
