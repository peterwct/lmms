import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/school-holidays.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/',       requirePermission('RESORTS_SETUP', 'view'),   ctrl.listSchoolHolidays);
router.get('/years',  requirePermission('RESORTS_SETUP', 'view'),   ctrl.getSchoolHolidayYears);  // static route before /:id
router.post('/clone', requirePermission('RESORTS_SETUP', 'create'), ctrl.cloneSchoolHolidayYear); // static route before /:id
router.post('/',      requirePermission('RESORTS_SETUP', 'create'), ctrl.createSchoolHoliday);
router.put('/:id',    requirePermission('RESORTS_SETUP', 'edit'),   ctrl.updateSchoolHoliday);
router.delete('/:id', requirePermission('RESORTS_SETUP', 'delete'), ctrl.deleteSchoolHoliday);

export default router;
