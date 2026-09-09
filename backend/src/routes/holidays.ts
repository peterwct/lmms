import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requireResortsSetupAccess } from '../middleware/permissions';
import * as ctrl from '../controllers/holidays.controller';

const router = Router();
// Resorts Setup is gated PER USER by the RESORTS_SETUP_ACCESS grant and nothing else -- the
// RESORTS_SETUP department-matrix row is inert (see requireResortsSetupAccess). The grant is
// all-or-nothing, hence no per-route view/create/edit/delete checks below. IT bypasses.
// Must come after authenticate -- it reads req.user.
router.use(authenticate, requirePasswordChanged, requireResortsSetupAccess);

router.get('/',       ctrl.listHolidays);
router.get('/years',  ctrl.getHolidayYears);   // static route before /:id
router.post('/clone', ctrl.cloneHolidayYear);  // static route before /:id
router.post('/',      ctrl.createHoliday);
router.put('/:id',    ctrl.updateHoliday);
router.delete('/:id', ctrl.deleteHoliday);

export default router;
