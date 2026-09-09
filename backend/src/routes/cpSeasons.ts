import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requireResortsSetupAccess } from '../middleware/permissions';
import * as ctrl from '../controllers/cp-seasons.controller';

const router = Router();
// Resorts Setup is gated PER USER by the RESORTS_SETUP_ACCESS grant and nothing else -- the
// RESORTS_SETUP department-matrix row is inert (see requireResortsSetupAccess). The grant is
// all-or-nothing, hence no per-route view/create/edit/delete checks below. IT bypasses.
// Must come after authenticate -- it reads req.user.
router.use(authenticate, requirePasswordChanged, requireResortsSetupAccess);

// The screen works a month at a time: read a month, save a month, delete a month.
// There is no per-day endpoint — editing goes through the month save.
router.get('/',          ctrl.listCpSeasonMonth);
router.get('/years',     ctrl.getCpSeasonYears);
router.post('/month',    ctrl.saveCpSeasonMonth);
router.delete('/month',  ctrl.deleteCpSeasonMonth);
router.post('/clone',    ctrl.cloneCpSeasonYear);

export default router;
