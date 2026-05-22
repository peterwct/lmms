import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import * as ctrl from '../controllers/agreements.controller';
import * as nomCtrl from '../controllers/nominees.controller';

const router = Router();
router.use(authenticate, requirePasswordChanged);

router.get('/',                    requirePermission('AGREEMENTS', 'view'),   ctrl.listAgreements);
router.get('/:id',                 requirePermission('AGREEMENTS', 'view'),   ctrl.getAgreement);
router.put('/:id',                 requirePermission('AGREEMENTS', 'edit'),   ctrl.updateAgreement);
router.patch('/:id/status',        requirePermission('AGREEMENTS', 'edit'),   ctrl.changeAgreementStatus);
router.put('/:id/nominees',        requirePermission('AGREEMENTS', 'edit'),   nomCtrl.updateNominees);

export default router;
