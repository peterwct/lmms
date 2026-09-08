import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/rci-enrolment.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/',        requirePermission('RESORTS_SETUP', 'view'),   ctrl.listRciEnrolments);
// Must stay ABOVE '/:id' - Express matches in declaration order, so a literal segment
// declared after it is swallowed as an id.
router.get('/agreement-search', requirePermission('RESORTS_SETUP', 'view'), ctrl.searchAgreements);
router.get('/:id',     requirePermission('RESORTS_SETUP', 'view'),   ctrl.getRciEnrolment);
router.post('/',       requirePermission('RESORTS_SETUP', 'create'), ctrl.createRciEnrolment);
router.put('/:id',     requirePermission('RESORTS_SETUP', 'edit'),   ctrl.updateRciEnrolment);
router.delete('/:id',  requirePermission('RESORTS_SETUP', 'delete'), ctrl.deleteRciEnrolment);

export default router;
