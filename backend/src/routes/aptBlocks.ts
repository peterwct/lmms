import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requireResortsSetupAccess } from '../middleware/permissions';
import * as ctrl from '../controllers/apt-blocks.controller';

const router = Router();
// Resorts Setup is gated PER USER by the RESORTS_SETUP_ACCESS grant and nothing else -- the
// RESORTS_SETUP department-matrix row is inert (see requireResortsSetupAccess). The grant is
// all-or-nothing, hence no per-route view/create/edit/delete checks below. IT bypasses.
// Must come after authenticate -- it reads req.user.
router.use(authenticate, requirePasswordChanged, requireResortsSetupAccess);

router.get('/',                 ctrl.listAptBlocks);
router.get('/availability-chart', ctrl.getAvailabilityChart);
router.get('/units',            ctrl.listUnitsWithAvailability);
router.get('/:id/availability', ctrl.getAptBlockAvailability);
router.post('/batch',  ctrl.createAptBlockBatch);
router.post('/',       ctrl.createAptBlock);
router.delete('/:id',  ctrl.deleteAptBlock);

export default router;
