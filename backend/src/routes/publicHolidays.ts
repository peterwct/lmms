import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/public-holidays.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/',       requirePermission('RESORTS_SETUP', 'view'),   ctrl.listPublicHolidays);
router.get('/years',  requirePermission('RESORTS_SETUP', 'view'),   ctrl.getHolidayYears);       // static route before /:id
router.post('/clone', requirePermission('RESORTS_SETUP', 'create'), ctrl.clonePublicHolidayYear); // static route before /:id
router.post('/',      requirePermission('RESORTS_SETUP', 'create'), ctrl.createPublicHoliday);
router.put('/:id',    requirePermission('RESORTS_SETUP', 'edit'),   ctrl.updatePublicHoliday);
router.delete('/:id', requirePermission('RESORTS_SETUP', 'delete'), ctrl.deletePublicHoliday);

export default router;
