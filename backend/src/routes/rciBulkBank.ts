import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/rci-bulk-bank.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

// /years and /units are declared before /:id so the param route doesn't swallow them
router.get('/years',            requirePermission('RESORTS_SETUP', 'view'),   ctrl.getRciBulkBankYears);
router.get('/units',            requirePermission('RESORTS_SETUP', 'view'),   ctrl.listBulkBankUnits);
router.get('/',                 requirePermission('RESORTS_SETUP', 'view'),   ctrl.listRciBulkBank);
router.get('/:id/availability', requirePermission('RESORTS_SETUP', 'view'),   ctrl.getRciBulkBankAvailability);
router.post('/',                requirePermission('RESORTS_SETUP', 'create'), ctrl.createRciBulkBank);
router.put('/:id',              requirePermission('RESORTS_SETUP', 'edit'),   ctrl.updateRciBulkBank);
router.delete('/:id',           requirePermission('RESORTS_SETUP', 'delete'), ctrl.deleteRciBulkBank);

export default router;
