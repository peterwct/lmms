import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/apartment-types.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/',        requirePermission('RESORTS_SETUP', 'view'),   ctrl.listApartmentTypes);
router.post('/',       requirePermission('RESORTS_SETUP', 'create'), ctrl.createApartmentType);
router.put('/:id',     requirePermission('RESORTS_SETUP', 'edit'),   ctrl.updateApartmentType);
router.delete('/:id',  requirePermission('RESORTS_SETUP', 'delete'), ctrl.deleteApartmentType);

export default router;
