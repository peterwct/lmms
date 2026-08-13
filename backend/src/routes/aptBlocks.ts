import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/apt-blocks.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/',                 requirePermission('RESORTS_SETUP', 'view'),   ctrl.listAptBlocks);
router.get('/availability-chart', requirePermission('RESORTS_SETUP', 'view'), ctrl.getAvailabilityChart);
router.get('/units',            requirePermission('RESORTS_SETUP', 'view'),   ctrl.listUnitsWithAvailability);
router.get('/:id/availability', requirePermission('RESORTS_SETUP', 'view'),   ctrl.getAptBlockAvailability);
router.post('/',       requirePermission('RESORTS_SETUP', 'create'), ctrl.createAptBlock);
router.put('/:id',     requirePermission('RESORTS_SETUP', 'edit'),   ctrl.updateAptBlock);
router.delete('/:id',  requirePermission('RESORTS_SETUP', 'delete'), ctrl.deleteAptBlock);

export default router;
