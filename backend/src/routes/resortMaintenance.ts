import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requireResortsSetupAccess } from '../middleware/permissions';
import * as ctrl from '../controllers/resort-maintenance.controller';

const router = Router();
// Resorts Setup is gated PER USER by the RESORTS_SETUP_ACCESS grant and nothing else -- the
// RESORTS_SETUP department-matrix row is inert (see requireResortsSetupAccess). The grant is
// all-or-nothing, hence no per-route view/create/edit/delete checks below. IT bypasses.
// Must come after authenticate -- it reads req.user.
router.use(authenticate, requirePasswordChanged, requireResortsSetupAccess);

router.get('/',                 ctrl.listMaintenance);
router.get('/years',            ctrl.getMaintenanceYears); // static route before /:id
router.get('/:id/availability', ctrl.getMaintenanceAvailability);
router.post('/',                ctrl.createMaintenance);
router.put('/:id',              ctrl.updateMaintenance);
router.delete('/:id',           ctrl.deleteMaintenance);

export default router;
