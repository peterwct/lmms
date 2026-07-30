import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/lvc-codes.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/',              requirePermission('RESORTS_SETUP', 'view'),   ctrl.listLvcCodes);
router.post('/',             requirePermission('RESORTS_SETUP', 'create'), ctrl.createLvcCode);
router.put('/:id',           requirePermission('RESORTS_SETUP', 'edit'),   ctrl.updateLvcCode);
router.patch('/:id/toggle',  requirePermission('RESORTS_SETUP', 'edit'),   ctrl.toggleLvcStatus);
router.delete('/:id',        requirePermission('RESORTS_SETUP', 'delete'), ctrl.deleteLvcCode);

export default router;
