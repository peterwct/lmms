import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/rci-enrolment.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/',        requirePermission('RESORTS_SETUP', 'view'),   ctrl.listRciEnrolments);
router.get('/lookup',  requirePermission('RESORTS_SETUP', 'view'),   ctrl.lookupAgreement);
router.get('/:id',     requirePermission('RESORTS_SETUP', 'view'),   ctrl.getRciEnrolment);
router.post('/',       requirePermission('RESORTS_SETUP', 'create'), ctrl.createRciEnrolment);
router.put('/:id',     requirePermission('RESORTS_SETUP', 'edit'),   ctrl.updateRciEnrolment);
router.delete('/:id',  requirePermission('RESORTS_SETUP', 'delete'), ctrl.deleteRciEnrolment);

export default router;
