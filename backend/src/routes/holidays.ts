import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/holidays.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/',       requirePermission('RESORTS_SETUP', 'view'),   ctrl.listHolidays);
router.get('/years',  requirePermission('RESORTS_SETUP', 'view'),   ctrl.getHolidayYears);   // static route before /:id
router.post('/clone', requirePermission('RESORTS_SETUP', 'create'), ctrl.cloneHolidayYear);  // static route before /:id
router.post('/',      requirePermission('RESORTS_SETUP', 'create'), ctrl.createHoliday);
router.put('/:id',    requirePermission('RESORTS_SETUP', 'edit'),   ctrl.updateHoliday);
router.delete('/:id', requirePermission('RESORTS_SETUP', 'delete'), ctrl.deleteHoliday);

export default router;
