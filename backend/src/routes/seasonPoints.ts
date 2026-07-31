import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/season-points.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

// The screen works a resort-year at a time: read a year, save a year, delete a year.
// The per-row delete exists only to drop a superseded effective-dated revision.
// '/year' is declared before '/:id' so the literal path isn't swallowed by the param.
// Every read/write carries type=HOME|AWAY — see the controller header.
router.get('/',         requirePermission('RESORTS_SETUP', 'view'),   ctrl.listSeasonPoints);
router.get('/years',    requirePermission('RESORTS_SETUP', 'view'),   ctrl.getSeasonPointYears);
router.post('/year',    requirePermission('RESORTS_SETUP', 'create'), ctrl.saveSeasonPointYear);
router.delete('/year',  requirePermission('RESORTS_SETUP', 'delete'), ctrl.deleteSeasonPointYear);
router.delete('/:id',   requirePermission('RESORTS_SETUP', 'delete'), ctrl.deleteSeasonPoint);

export default router;
