import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/resort-units.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/',        requirePermission('RESORTS_SETUP', 'view'),   ctrl.listResortUnits);
router.post('/',       requirePermission('RESORTS_SETUP', 'create'), ctrl.createResortUnit);
router.put('/:id',     requirePermission('RESORTS_SETUP', 'edit'),   ctrl.updateResortUnit);
router.delete('/:id',  requirePermission('RESORTS_SETUP', 'delete'), ctrl.deleteResortUnit);

export default router;
