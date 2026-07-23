import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/resorts.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/',           requirePermission('RESORTS_SETUP', 'view'),   ctrl.listResorts);
router.get('/:id',        requirePermission('RESORTS_SETUP', 'view'),   ctrl.getResort);
router.post('/',          requirePermission('RESORTS_SETUP', 'create'), ctrl.createResort);
router.put('/:id/info',   requirePermission('RESORTS_SETUP', 'edit'),   ctrl.updateResortInfo);
router.put('/:id',        requirePermission('RESORTS_SETUP', 'edit'),   ctrl.updateResort);
router.patch('/:id/toggle', requirePermission('RESORTS_SETUP', 'edit'), ctrl.toggleResortStatus);
router.delete('/:id',     requirePermission('RESORTS_SETUP', 'delete'), ctrl.deleteResort);

export default router;
