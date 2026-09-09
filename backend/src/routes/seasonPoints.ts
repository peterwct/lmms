import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requireResortsSetupAccess } from '../middleware/permissions';
import * as ctrl from '../controllers/season-points.controller';

const router = Router();
// Resorts Setup is gated PER USER by the RESORTS_SETUP_ACCESS grant and nothing else -- the
// RESORTS_SETUP department-matrix row is inert (see requireResortsSetupAccess). The grant is
// all-or-nothing, hence no per-route view/create/edit/delete checks below. IT bypasses.
// Must come after authenticate -- it reads req.user.
router.use(authenticate, requirePasswordChanged, requireResortsSetupAccess);

// The screen works a VERSION at a time: list a resort's versions, read one, save one,
// delete one. A version is all rows sharing (resortCode, effectiveDate) and stays in force
// until a later one supersedes it — there is no per-year chart and no per-row delete
// (dropping a type/season is done by blanking its cells and re-saving).
// Every read/write carries type=HOME|AWAY — see the controller header.
router.get('/',           ctrl.listSeasonPoints);
router.get('/versions',   ctrl.getSeasonPointVersions);
router.post('/version',   ctrl.saveSeasonPointVersion);
router.delete('/version', ctrl.deleteSeasonPointVersion);

export default router;
