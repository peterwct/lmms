import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/cp-season-points.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

// The screen works a resort-year at a time: read a year, save a year, delete a year.
// The per-row delete exists only to drop a superseded effective-dated revision.
// '/year' is declared before '/:id' so the literal path isn't swallowed by the param.
router.get('/',         requirePermission('RESORTS_SETUP', 'view'),   ctrl.listCpSeasonPoints);
router.get('/years',    requirePermission('RESORTS_SETUP', 'view'),   ctrl.getCpSeasonPointYears);
router.post('/year',    requirePermission('RESORTS_SETUP', 'create'), ctrl.saveCpSeasonPointYear);
router.delete('/year',  requirePermission('RESORTS_SETUP', 'delete'), ctrl.deleteCpSeasonPointYear);
router.delete('/:id',   requirePermission('RESORTS_SETUP', 'delete'), ctrl.deleteCpSeasonPoint);

export default router;
