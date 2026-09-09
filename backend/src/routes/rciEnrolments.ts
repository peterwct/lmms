import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/rci-enrolment.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/',        requirePermission('RESORT_BOOKING', 'view'),   ctrl.listRciEnrolments);
// Must stay ABOVE '/:id' - Express matches in declaration order, so a literal segment
// declared after it is swallowed as an id.
router.get('/agreement-search', requirePermission('RESORT_BOOKING', 'view'), ctrl.searchAgreements);
router.get('/:id',     requirePermission('RESORT_BOOKING', 'view'),   ctrl.getRciEnrolment);
router.post('/',       requirePermission('RESORT_BOOKING', 'create'), ctrl.createRciEnrolment);
router.put('/:id',     requirePermission('RESORT_BOOKING', 'edit'),   ctrl.updateRciEnrolment);
router.delete('/:id',  requirePermission('RESORT_BOOKING', 'delete'), ctrl.deleteRciEnrolment);

export default router;
