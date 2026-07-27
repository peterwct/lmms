import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/resort-maintenance.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/',                 requirePermission('RESORTS_SETUP', 'view'),   ctrl.listMaintenance);
router.get('/years',            requirePermission('RESORTS_SETUP', 'view'),   ctrl.getMaintenanceYears); // static route before /:id
router.get('/:id/availability', requirePermission('RESORTS_SETUP', 'view'),   ctrl.getMaintenanceAvailability);
router.post('/',                requirePermission('RESORTS_SETUP', 'create'), ctrl.createMaintenance);
router.put('/:id',              requirePermission('RESORTS_SETUP', 'edit'),   ctrl.updateMaintenance);
router.delete('/:id',           requirePermission('RESORTS_SETUP', 'delete'), ctrl.deleteMaintenance);

export default router;
