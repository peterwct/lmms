import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/cp-seasons.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

// The screen works a month at a time: read a month, save a month, delete a month.
// There is no per-day endpoint — editing goes through the month save.
router.get('/',          requirePermission('RESORTS_SETUP', 'view'),   ctrl.listCpSeasonMonth);
router.get('/years',     requirePermission('RESORTS_SETUP', 'view'),   ctrl.getCpSeasonYears);
router.post('/month',    requirePermission('RESORTS_SETUP', 'create'), ctrl.saveCpSeasonMonth);
router.delete('/month',  requirePermission('RESORTS_SETUP', 'delete'), ctrl.deleteCpSeasonMonth);
router.post('/clone',    requirePermission('RESORTS_SETUP', 'create'), ctrl.cloneCpSeasonYear);

export default router;
