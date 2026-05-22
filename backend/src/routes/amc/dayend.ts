import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../../middleware/auth';
import { requireITorCredit } from '../../middleware/permissions';
import * as ctrl from '../../controllers/amc/dayend.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged, requireITorCredit);

router.post('/generate',    ctrl.generateDayEnd);
router.get('/history',      ctrl.listDayEndHistory);
router.get('/download/:filename', ctrl.downloadDayEndFile);

export default router;
