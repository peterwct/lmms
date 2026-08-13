import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/season-points.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

// The screen works a VERSION at a time: list a resort's versions, read one, save one,
// delete one. A version is all rows sharing (resortCode, effectiveDate) and stays in force
// until a later one supersedes it — there is no per-year chart and no per-row delete
// (dropping a type/season is done by blanking its cells and re-saving).
// Every read/write carries type=HOME|AWAY — see the controller header.
router.get('/',           requirePermission('RESORTS_SETUP', 'view'),   ctrl.listSeasonPoints);
router.get('/versions',   requirePermission('RESORTS_SETUP', 'view'),   ctrl.getSeasonPointVersions);
router.post('/version',   requirePermission('RESORTS_SETUP', 'create'), ctrl.saveSeasonPointVersion);
router.delete('/version', requirePermission('RESORTS_SETUP', 'delete'), ctrl.deleteSeasonPointVersion);

export default router;
